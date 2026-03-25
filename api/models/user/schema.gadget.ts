import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "user" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "DataModel-AppAuth-User",
  fields: {
    email: {
      type: "email",
      validations: { required: true, unique: true },
      storageKey: "uwTfw77-WqPZ",
    },
    emailVerificationToken: {
      type: "string",
      storageKey: "VGc4Tw0WhXeT",
    },
    emailVerificationTokenExpiration: {
      type: "dateTime",
      includeTime: true,
      storageKey: "d81OKxZV4N4j",
    },
    emailVerified: {
      type: "boolean",
      default: false,
      storageKey: "BvNMxHFWCYIc",
    },
    firstName: { type: "string", storageKey: "pEoG31C05HTB" },
    googleImageUrl: { type: "url", storageKey: "sH4X5qp9lnU6" },
    googleProfileId: { type: "string", storageKey: "-Za6CqC4jsvE" },
    lastName: { type: "string", storageKey: "N1w9xSFFzbbk" },
    lastSignedIn: {
      type: "dateTime",
      includeTime: true,
      storageKey: "tykULQhohkkW",
    },
    password: {
      type: "password",
      validations: { strongPassword: true },
      storageKey: "2ZjxdDiOOumP",
    },
    profilePicture: {
      type: "file",
      allowPublicAccess: true,
      storageKey: "b56H4ZwWCAvW",
    },
    resetPasswordToken: {
      type: "string",
      storageKey: "WylaYpOtSYd8",
    },
    resetPasswordTokenExpiration: {
      type: "dateTime",
      includeTime: true,
      storageKey: "Ba6ulVNrJYGj",
    },
    roles: {
      type: "roleList",
      default: ["unauthenticated"],
      storageKey: "HilwgeBDpp5d",
    },
  },
};
