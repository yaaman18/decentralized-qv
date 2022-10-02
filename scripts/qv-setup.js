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

const schemas_event = {
  type: "object",
  required: [
    "user_address",
    "secret_key",
    "event_title",
    "event_description",
    "num_voters",
    "credit_per_voter",
    "start_event_date",
    "end_event_date",
    "create_at",
    "event_data",
    "voters",
  ],
  propeties: {
    user_address: {
      type: "string",
    },
    secret_key: {
      type: "string",
    },
    event_title: {
      type: "string",
    },
    event_description: {
      type: "string",
    },
    num_voter: {
      type: "Int",
    },
    credit_per_voter: {
      type: "Int",
    },
    start_event_date: {
      type: "DateTime",
    },
    end_event_date: {
      type: "DateTime",
    },
    created_at: {
      type: "DateTime",
    },
    event_data: {
      type: "Json",
    },
    Voters: {
      type: "Voters[]",
    },
  },
};
await db.setSchema(schemas_event, "event");

const schemas_voters = {
  type: "object",
  required: ["user_address", "event_uuid", "voter_name", "vote_data", "Events"],
  propeties: {
    user_address: {
      type: "string",
    },
    event_uuid: {
      type: "string",
    },
    voter_name: {
      type: "string",
    },
    vote_data: {
      type: "json",
    },
    Events: {
      type: "Events",
    },
  },
};
await db.setSchema(schemas_voters, "voters");

const rules_event = {};
