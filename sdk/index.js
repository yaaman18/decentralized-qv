const EthCrypto = require("eth-crypto")
const { all, complement, init, is, last, isNil } = require("ramda")
let Arweave = require("arweave")
Arweave = isNil(Arweave.default) ? Arweave : Arweave.default
const ethSigUtil = require("@metamask/eth-sig-util")
const { privateToAddress } = require("ethereumjs-util")
const {
  Warp,
  WarpNodeFactory,
  WarpWebFactory,
  LoggerFactory,
} = require("warp-contracts")

const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "verifyingContract", type: "string" },
]

const encoding = require("text-encoding")
const encoder = new encoding.TextEncoder()

class SDK {
  constructor({
    arweave,
    contractTxId,
    wallet,
    name,
    version,
    EthWallet,
    web3,
  }) {
    this.arweave = Arweave.init(arweave)
    LoggerFactory.INST.logLevel("error")
    if (typeof window === "object") {
      require("@metamask/legacy-web3")
      this.web3 = window.web3
    }
    this.network =
      arweave.host === "localhost"
        ? "localhost"
        : arweave.host === "arweave.net"
        ? "mainnet"
        : "testnet"
    if (this.network === "localhost") {
      this.warp = WarpNodeFactory.forTesting(this.arweave)
    } else {
      if (isNil(web3)) {
        this.warp = WarpNodeFactory.memCachedBased(this.arweave)
          .useWarpGateway()
          .build()
      } else {
        this.warp = WarpWebFactory.memCachedBased(this.arweave)
          .useWarpGateway()
          .build()
      }
    }
    if (all(complement(isNil))([contractTxId, wallet, name, version])) {
      this.initialize({ contractTxId, wallet, name, version, EthWallet })
    }
  }

  initialize({ contractTxId, wallet, name, version, EthWallet }) {
    this.arweave_wallet = wallet
    this.db = this.warp.pst(contractTxId).connect(wallet)
    this.domain = { name, version, verifyingContract: contractTxId }
    if (!isNil(EthWallet)) this.setEthWallet(EthWallet)
  }

  setEthWallet(wallet) {
    this.wallet = wallet
  }

  async mineBlock() {
    await this.arweave.api.get("mine")
  }

  async read(func, ...query) {
    return this.viewState({
      function: func,
      query,
    })
  }

  async viewState(opt) {
    let res = await this.db.viewState(opt)
    return res.result
  }

  async get(...query) {
    return this.read("get", ...query)
  }

  async cget(...query) {
    return this.read("cget", ...query)
  }

  async getIndexes(...query) {
    return this.read("getIndexes", ...query)
  }

  async getCrons(...query) {
    return this.read("getCrons", ...query)
  }

  async getSchema(...query) {
    return this.read("getSchema", ...query)
  }

  async getRules(...query) {
    return this.read("getRules", ...query)
  }

  async getNonce(addr) {
    return (
      (await this.viewState({
        function: "nonce",
        address: addr,
      })) + 1
    )
  }

  async getIds(tx) {
    return this.viewState({
      function: "ids",
      tx,
    })
  }

  async _write(func, ...query) {
    let opt = null
    if (is(Object, last(query)) && !is(Array, last(query))) {
      opt = last(query)
      query = init(query)
    }
    if (func === "batch") query = query[0]
    return await this._write2(func, query, opt)
  }

  async _write2(func, query, opt) {
    let nonce, privateKey, overwrite, wallet, dryWrite, bundle, ii, ar
    if (!isNil(opt)) {
      ;({
        nonce,
        privateKey,
        overwrite,
        wallet,
        dryWrite,
        bundle,
        ii,
        ar,
      } = opt)
    }
    return !isNil(ii)
      ? await this.writeWithII(ii, func, query, nonce, dryWrite, bundle)
      : !isNil(ar)
      ? await this.writeWithAR(ar, func, query, nonce, dryWrite, bundle)
      : await this.write(
          wallet || this.wallet,
          func,
          query,
          nonce,
          privateKey,
          overwrite,
          dryWrite,
          bundle
        )
  }

  async createTempAddressWithII(ii) {
    let addr = ii.toJSON()[0]
    return this._createTempAddress(addr, {
      ii,
    })
  }

  async createTempAddressWithAR(ar) {
    const wallet = is(Object, ar) && ar.walletName === "ArConnect" ? ar : null
    let addr = null
    if (!isNil(wallet)) {
      await wallet.connect(["SIGNATURE", "ACCESS_PUBLIC_KEY", "ACCESS_ADDRESS"])
      addr = await wallet.getActiveAddress()
    } else {
      addr = await this.arweave.wallets.jwkToAddress(ar)
    }
    return this._createTempAddress(addr, {
      ar,
    })
  }

  async createTempAddress(addr) {
    return this._createTempAddress(addr.toLowerCase(), {
      wallet: this.wallet || addr.toLowerCase(),
    })
  }

  async _createTempAddress(addr, opt) {
    const identity = EthCrypto.createIdentity()
    const nonce = await this.getNonce(addr)
    const message = {
      nonce,
      query: JSON.stringify({
        func: "auth",
        query: { address: addr },
      }),
    }
    const data = {
      types: {
        EIP712Domain,
        Query: [
          { name: "query", type: "string" },
          { name: "nonce", type: "uint256" },
        ],
      },
      domain: this.domain,
      primaryType: "Query",
      message,
    }
    const signature = ethSigUtil.signTypedData({
      privateKey: Buffer.from(identity.privateKey.replace(/^0x/, ""), "hex"),
      data,
      version: "V4",
    })
    const tx = await this.addAddressLink(
      { signature, address: identity.address.toLowerCase() },
      { nonce, ...opt }
    )
    return isNil(tx.err) ? { tx, identity } : null
  }

  async addAddressLink(query, opt) {
    return await this._write2("addAddressLink", query, opt)
  }

  async removeAddressLink(query, opt) {
    return await this._write2("removeAddressLink", query, opt)
  }

  async set(...query) {
    return this._write("set", ...query)
  }

  async delete(...query) {
    return this._write("delete", ...query)
  }

  async add(...query) {
    return this._write("add", ...query)
  }

  async addIndex(...query) {
    return this._write("addIndex", ...query)
  }

  async addCron(...query) {
    return this._write("addCron", ...query)
  }

  async removeCron(...query) {
    return this._write("removeCron", ...query)
  }

  async removeIndex(...query) {
    return this._write("removeIndex", ...query)
  }

  async update(...query) {
    return this._write("update", ...query)
  }

  async upsert(...query) {
    return this._write("upsert", ...query)
  }

  async setSchema(...query) {
    return this._write("setSchema", ...query)
  }

  async setRules(...query) {
    return this._write("setRules", ...query)
  }

  async batch(...query) {
    return this._write("batch", ...query)
  }

  async writeWithII(ii, func, query, nonce, dryWrite = true, bundle) {
    let addr = ii.toJSON()[0]
    const isaddr = !isNil(addr)
    addr = addr.toLowerCase()
    let result
    nonce ||= await this.getNonce(addr)
    bundle ||= this.network === "mainnet"
    const message = {
      nonce,
      query: JSON.stringify({ func, query }),
    }
    const data = {
      types: {
        EIP712Domain,
        Query: [
          { name: "query", type: "string" },
          { name: "nonce", type: "uint256" },
        ],
      },
      domain: this.domain,
      primaryType: "Query",
      message,
    }

    function toHexString(bytes) {
      return new Uint8Array(bytes).reduce(
        (str, byte) => str + byte.toString(16).padStart(2, "0"),
        ""
      )
    }
    const _data = Buffer.from(JSON.stringify(data))
    const signature = toHexString(await ii.sign(_data))
    const param = {
      function: func,
      query,
      signature,
      nonce,
      caller: addr,
      type: "ed25519",
    }
    if (dryWrite) {
      let dryState = await this.db.dryWrite(param)
      if (dryState.type === "error") return { err: dryState }
    }
    return await this.send(param, bundle)
  }

  async writeWithAR(ar, func, query, nonce, dryWrite = true, bundle) {
    const wallet = is(Object, ar) && ar.walletName === "ArConnect" ? ar : null
    let addr = null
    let pubKey = null
    if (!isNil(wallet)) {
      await wallet.connect(["SIGNATURE", "ACCESS_PUBLIC_KEY", "ACCESS_ADDRESS"])
      addr = await wallet.getActiveAddress()
      pubKey = await wallet.getActivePublicKey()
    } else {
      addr = await this.arweave.wallets.jwkToAddress(ar)
      pubKey = ar.n
    }
    const isaddr = !isNil(addr)
    let result
    nonce ||= await this.getNonce(addr)
    bundle ||= this.network === "mainnet"
    const message = {
      nonce,
      query: JSON.stringify({ func, query }),
    }
    const data = {
      types: {
        EIP712Domain,
        Query: [
          { name: "query", type: "string" },
          { name: "nonce", type: "uint256" },
        ],
      },
      domain: this.domain,
      primaryType: "Query",
      message,
    }
    const encoded = encoder.encode(JSON.stringify(data))
    const signature = isNil(wallet)
      ? (await this.arweave.wallets.crypto.sign(ar, encoded)).toString("hex")
      : Buffer.from(
          await wallet.signature(encoded, {
            name: "RSA-PSS",
            saltLength: 32,
          })
        ).toString("hex")
    const param = {
      function: func,
      query,
      signature,
      nonce,
      caller: addr,
      pubKey,
      type: "rsa256",
    }
    if (dryWrite) {
      let dryState = await this.db.dryWrite(param)
      if (dryState.type === "error") return { err: dryState }
    }
    return await this.send(param, bundle)
  }

  async write(
    wallet,
    func,
    query,
    nonce,
    privateKey,
    overwrite,
    dryWrite = true,
    bundle
  ) {
    let addr = isNil(privateKey)
      ? null
      : `0x${privateToAddress(
          Buffer.from(privateKey.replace(/^0x/, ""), "hex")
        ).toString("hex")}`
    const isaddr = !isNil(addr)
    if (isNil(addr)) {
      addr = is(String, wallet) ? wallet : wallet.getAddressString()
    }
    addr = addr.toLowerCase()
    let result
    nonce ||= await this.getNonce(addr)
    bundle ||= this.network === "mainnet"
    const message = {
      nonce,
      query: JSON.stringify({ func, query }),
    }
    const data = {
      types: {
        EIP712Domain,
        Query: [
          { name: "query", type: "string" },
          { name: "nonce", type: "uint256" },
        ],
      },
      domain: this.domain,
      primaryType: "Query",
      message,
    }
    const signature =
      !isaddr && !isNil(this.web3)
        ? await this.web3.currentProvider.request({
            method: "eth_signTypedData_v4",
            params: [addr, JSON.stringify(data)],
          })
        : ethSigUtil.signTypedData({
            privateKey: !isNil(privateKey)
              ? Buffer.from(privateKey.replace(/^0x/, ""), "hex")
              : wallet.getPrivateKey(),
            data,
            version: "V4",
          })

    const param = {
      function: func,
      query,
      signature,
      nonce,
      caller:
        overwrite || isNil(wallet)
          ? addr
          : is(String, wallet)
          ? wallet
          : wallet.getAddressString(),
    }
    if (dryWrite) {
      let dryState = await this.db.dryWrite(param)
      if (dryState.type === "error") return { err: dryState }
    }
    return await this.send(param, bundle)
  }

  async send(param, bundle) {
    let tx = await this.db[bundle ? "bundleInteraction" : "writeInteraction"](
      param
    )
    if (this.network === "localhost") await this.mineBlock()
    return tx
  }

  signer() {
    return { __op: "signer" }
  }

  ts() {
    return { __op: "ts" }
  }

  del() {
    return { __op: "del" }
  }

  inc(n) {
    return { __op: "inc", n }
  }

  union(...args) {
    return { __op: "arrayUnion", arr: args }
  }

  remove(...args) {
    return { __op: "arrayRemove", arr: args }
  }
}

module.exports = SDK
