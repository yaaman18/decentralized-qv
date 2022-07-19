const fs = require("fs")
const path = require("path")
const { expect } = require("chai")
const ethSigUtil = require("@metamask/eth-sig-util")
const Wallet = require("ethereumjs-wallet").default
const {
  PstContract,
  PstState,
  Warp,
  WarpNodeFactory,
  LoggerFactory,
  InteractionResult,
} = require("warp-contracts")
const { isNil } = require("ramda")
const ArLocal = require("arlocal").default

const Arweave = require("arweave")

async function addFunds(arweave, wallet) {
  const walletAddress = await arweave.wallets.getAddress(wallet)
  await arweave.api.get(`/mint/${walletAddress}/1000000000000000`)
}

async function mineBlock(arweave) {
  await arweave.api.get("mine")
}

let arlocal,
  arweave,
  warp,
  arweave_wallet,
  wallet,
  wallet2,
  walletAddress,
  contractSrc,
  initialState,
  wdb,
  domain

const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "verifyingContract", type: "string" },
]

async function init() {
  arlocal = new ArLocal(1820, false)
  await arlocal.start()
  arweave = Arweave.init({
    host: "localhost",
    port: 1820,
    protocol: "http",
  })
  LoggerFactory.INST.logLevel("error")
  warp = WarpNodeFactory.forTesting(arweave)
  return {
    arlocal,
    arweave,
    warp,
  }
}

async function initBeforeEach(secure = false) {
  wallet = Wallet.generate()
  wallet2 = Wallet.generate()
  arweave_wallet = await arweave.wallets.generate()
  await addFunds(arweave, arweave_wallet)
  walletAddress = await arweave.wallets.jwkToAddress(arweave_wallet)

  contractSrc = fs.readFileSync(
    path.join(__dirname, "../dist/contract.js"),
    "utf8"
  )
  const stateFromFile = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../dist/contracts/initial-state.json"),
      "utf8"
    )
  )
  initialState = {
    ...stateFromFile,
    ...{
      secure,
      owner: walletAddress,
    },
  }
  const { contractTxId } = await warp.createContract.deploy({
    wallet: arweave_wallet,
    initState: JSON.stringify(initialState),
    src: contractSrc,
  })
  wdb = warp.pst(contractTxId).connect(arweave_wallet)
  await mineBlock(arweave)
  const name = "asteroid"
  const version = "1"
  domain = { name, version, verifyingContract: wdb._contractTxId }

  return {
    wallet,
    walletAddress,
    contractSrc,
    initialState,
    wdb,
    wallet,
    wallet2,
    arweave_wallet,
    domain,
  }
}

const getNonce = async function (addr) {
  let result
  ;({ result } = await wdb.viewState({
    function: "nonce",
    address: addr,
  }))
  return result + 1
}

const getIds = async function (tx) {
  let result
  ;({ result } = await wdb.viewState({
    function: "ids",
    tx,
  }))
  return result
}

const cget = async function (query) {
  let result
  ;({ result } = await wdb.viewState({
    function: "cget",
    query,
  }))
  return result
}

const get = async function (query) {
  let result
  ;({ result } = await wdb.viewState({
    function: "get",
    query,
  }))
  return result
}

const getIndexes = async function (query) {
  let result
  ;({ result } = await wdb.viewState({
    function: "getIndexes",
    query,
  }))
  return result
}

const getSchema = async function (query) {
  let result
  ;({ result } = await wdb.viewState({
    function: "getSchema",
    query,
  }))
  return result
}

const getRules = async function (query) {
  let result
  ;({ result } = await wdb.viewState({
    function: "getRules",
    query,
  }))
  return result
}

const query = async function (
  wallet,
  func,
  query,
  nonce,
  addr,
  privateKey,
  overwrite
) {
  addr ||= wallet.getAddressString()
  let result
  nonce ||= await getNonce(addr)
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
    domain,
    primaryType: "Query",
    message,
  }
  const signature = ethSigUtil.signTypedData({
    privateKey: privateKey || wallet.getPrivateKey(),
    data,
    version: "V4",
  })
  expect(
    ethSigUtil.recoverTypedSignature({
      version: "V4",
      data,
      signature,
    })
  ).to.equal(addr)
  let tx = null
  tx = await wdb.writeInteraction({
    function: func,
    query,
    signature,
    nonce,
    caller: overwrite ? addr : wallet.getAddressString(),
  })
  await mineBlock(arweave)
  return tx
}

module.exports = {
  get,
  cget,
  getSchema,
  getRules,
  query,
  getNonce,
  getIds,
  addFunds,
  mineBlock,
  init,
  initBeforeEach,
  getIndexes,
}
