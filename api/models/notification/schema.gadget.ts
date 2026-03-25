import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "notification" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "dWyjFw934WDc",
  comment:
    "Model for user notifications, used to inform users of important events",
  fields: {
    actionUrl: {
      type: "url",
      storageKey: "0GBP4Ddc3IHI",
      filterIndex: false,
      searchIndex: false,
    },
    isRead: {
      type: "boolean",
      default: false,
      validations: { required: true },
      storageKey: "0WMyBgmxhRlY",
    },
    message: {
      type: "string",
      validations: { required: true },
      storageKey: "xjlp_0Ip3X5z",
      filterIndex: false,
    },
    metadata: {
      type: "json",
      storageKey: "7yg-hHbm0Caw",
      searchIndex: false,
    },
    readAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "dAOO4mwyv_R0",
      searchIndex: false,
    },
    relatedId: { type: "string", storageKey: "xeFSfVe_WQRd" },
    relatedModel: {
      type: "string",
      storageKey: "mB-Ml1z4VTVW",
      searchIndex: false,
    },
    severity: {
      type: "enum",
      default: "info",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["info", "success", "warning", "error", "critical"],
      validations: { required: true },
      storageKey: "zkMspBb5Qo5u",
    },
    title: {
      type: "string",
      validations: { required: true },
      storageKey: "2I1ZxUxSwF6z",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "trade",
        "deposit",
        "withdrawal",
        "alert",
        "security",
        "strategy",
        "system",
        "mining",
      ],
      validations: { required: true },
      storageKey: "V7BJAHn6nBEP",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "ngau3mkc0NUa",
    },
  },
};
