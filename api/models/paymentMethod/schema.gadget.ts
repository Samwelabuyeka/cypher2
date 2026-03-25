import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "paymentMethod" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "5h3HbTAZZtZ1",
  comment:
    "This model stores user payment methods, including credit cards, bank accounts, and cryptocurrencies.",
  fields: {
    bankAccountNumber: {
      type: "string",
      storageKey: "MsRw_oFmwXd_",
      filterIndex: false,
      searchIndex: false,
    },
    bankName: { type: "string", storageKey: "LFwN3lah5xtR" },
    bankSwiftCode: {
      type: "string",
      storageKey: "XuHBPp55gHUm",
      filterIndex: false,
      searchIndex: false,
    },
    cardBrand: { type: "string", storageKey: "1tNA_tR9-tFB" },
    cardLast4: {
      type: "string",
      storageKey: "6416Vzu-rS1n",
      filterIndex: false,
      searchIndex: false,
    },
    cryptoAddress: {
      type: "string",
      validations: { run: ["validateCryptoAddress"] },
      storageKey: "wJgFSglDDprv",
    },
    cryptoNetwork: { type: "string", storageKey: "M96ikqznrfWu" },
    expiryMonth: {
      type: "number",
      decimals: 0,
      storageKey: "nraNkE4TQhKF",
      searchIndex: false,
    },
    expiryYear: {
      type: "number",
      decimals: 0,
      storageKey: "fOCmwD-GpCRn",
      filterIndex: false,
      searchIndex: false,
    },
    isActive: {
      type: "boolean",
      default: false,
      validations: { required: true },
      storageKey: "w5WSmIq11Rvr",
    },
    isDefault: {
      type: "boolean",
      default: false,
      validations: { required: true },
      storageKey: "57oPa-86LlRi",
      searchIndex: false,
    },
    lastUsedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "cMG-xMMrWNgD",
      searchIndex: false,
    },
    metadata: {
      type: "json",
      storageKey: "hyn-P5zNCSv_",
      filterIndex: false,
      searchIndex: false,
    },
    mpesaPhoneNumber: {
      type: "string",
      storageKey: "VPGV-nDgdBW3",
      filterIndex: false,
      searchIndex: false,
    },
    nickname: { type: "string", storageKey: "Bje4uUkah1oT" },
    paypalEmail: { type: "string", storageKey: "r8Y8JpEttJsV" },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["mpesa", "paypal", "bank", "crypto", "card"],
      validations: { required: true },
      storageKey: "P3utNuxIM6CX",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "NDYCVNxMHoWJ",
    },
  },
};
