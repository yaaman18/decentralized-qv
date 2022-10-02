const EthCrypto = require("eth-crypto");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const wallet_name = process.argv[2];
const contractTxId = process.argv[3] || process.env.CONTRACT_TX_ID_TODOS;
const { isNil } = require("ramda");
const SDK = require("../sdk");

if (isNil(wallet_name)) {
  console.log("no wallet name given");
  process.exit();
}

if (isNil(contractTxId)) {
  console.log("contract not specified");
  process.exit();
}
