/**
 * Comprehensive Input Validation Library
 * Provides validation rules, schemas, and sanitization for trading application
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface ValidationRule {
  required?: boolean;
  optional?: boolean;
  nullable?: boolean;
}

export interface StringRule extends ValidationRule {
  type: "string";
  min?: number;
  max?: number;
  pattern?: RegExp;
  email?: boolean;
  url?: boolean;
}

export interface NumberRule extends ValidationRule {
  type: "number";
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
  decimals?: number;
}

export interface BooleanRule extends ValidationRule {
  type: "boolean";
}

export interface DateRule extends ValidationRule {
  type: "date";
  min?: Date;
  max?: Date;
  format?: string;
}

export interface ArrayRule extends ValidationRule {
  type: "array";
  minLength?: number;
  maxLength?: number;
  itemType?: FieldRule;
}

export interface ObjectRule extends ValidationRule {
  type: "object";
  shape: Record<string, FieldRule>;
  strict?: boolean;
}

export interface EnumRule extends ValidationRule {
  type: "enum";
  allowedValues: any[];
}

export interface CustomRule extends ValidationRule {
  type: "custom";
  validator: (value: any) => boolean | string;
}

export type FieldRule =
  | StringRule
  | NumberRule
  | BooleanRule
  | DateRule
  | ArrayRule
  | ObjectRule
  | EnumRule
  | CustomRule;

export type ValidationSchema = Record<string, FieldRule>;

export interface ValidationError {
  field: string;
  message: string;
  rule: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedData?: any;
}

export interface FieldResult {
  isValid: boolean;
  error?: ValidationError;
  sanitizedValue?: any;
}

export interface BatchValidationOptions {
  stopOnFirstError?: boolean;
  collectAllErrors?: boolean;
}

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Sanitize string values by trimming and escaping HTML
 */
export function sanitizeString(value: any): string {
  if (typeof value !== "string") {
    return String(value);
  }

  // Trim whitespace
  let sanitized = value.trim();

  // Remove XSS threats
  sanitized = removeXSS(sanitized);

  return sanitized;
}

/**
 * Remove XSS attack vectors from strings
 */
export function removeXSS(value: string): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Sanitize and parse number values
 */
export function sanitizeNumber(
  value: any,
  options?: { min?: number; max?: number; decimals?: number }
): number {
  let num = typeof value === "number" ? value : parseFloat(value);

  if (isNaN(num)) {
    throw new Error("Invalid number");
  }

  // Apply bounds
  if (options?.min !== undefined && num < options.min) {
    num = options.min;
  }
  if (options?.max !== undefined && num > options.max) {
    num = options.max;
  }

  // Apply decimal precision
  if (options?.decimals !== undefined) {
    num = parseFloat(num.toFixed(options.decimals));
  }

  return num;
}

/**
 * Sanitize array values
 */
export function sanitizeArray<T>(
  value: any,
  sanitizer?: (item: any) => T
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  if (sanitizer) {
    return value.map(sanitizer).filter((item) => item !== null && item !== undefined);
  }

  return value.filter((item) => item !== null && item !== undefined);
}

// ============================================================================
// Custom Validators
// ============================================================================

/**
 * Validate trading pair format (e.g., BTC/USD, ETH-USDT)
 */
export function validateTradingPair(pair: string): boolean | string {
  const pattern = /^[A-Z]{2,10}[\/-][A-Z]{2,10}$/;
  if (!pattern.test(pair)) {
    return "Invalid trading pair format. Expected format: BTC/USD or ETH-USDT";
  }
  return true;
}

/**
 * Validate price is positive and within reasonable decimals
 */
export function validatePrice(price: number, maxDecimals: number = 8): boolean | string {
  if (price <= 0) {
    return "Price must be positive";
  }

  const decimals = (price.toString().split(".")[1] || "").length;
  if (decimals > maxDecimals) {
    return `Price can have at most ${maxDecimals} decimal places`;
  }

  return true;
}

/**
 * Validate quantity is positive
 */
export function validateQuantity(quantity: number): boolean | string {
  if (quantity <= 0) {
    return "Quantity must be positive";
  }
  return true;
}

/**
 * Validate percentage is between 0 and 100
 */
export function validatePercentage(value: number): boolean | string {
  if (value < 0 || value > 100) {
    return "Percentage must be between 0 and 100";
  }
  return true;
}

/**
 * Validate date range
 */
export function validateDateRange(
  startDate: Date,
  endDate: Date
): boolean | string {
  if (startDate >= endDate) {
    return "Start date must be before end date";
  }
  return true;
}

// ============================================================================
// Error Message Generator
// ============================================================================

function generateErrorMessage(
  field: string,
  rule: string,
  ruleValue?: any
): string {
  const messages: Record<string, string> = {
    required: `${field} is required`,
    min: `${field} must be at least ${ruleValue}`,
    max: `${field} must be at most ${ruleValue}`,
    minLength: `${field} must have at least ${ruleValue} items`,
    maxLength: `${field} must have at most ${ruleValue} items`,
    integer: `${field} must be an integer`,
    positive: `${field} must be positive`,
    email: `${field} must be a valid email address`,
    url: `${field} must be a valid URL`,
    pattern: `${field} does not match required pattern`,
    enum: `${field} must be one of: ${ruleValue?.join(", ")}`,
    type: `${field} has invalid type`,
  };

  return messages[rule] || `${field} failed validation: ${rule}`;
}

// ============================================================================
// Main Validator Class
// ============================================================================

export class Validator {
  /**
   * Validate data against schema
   */
  validate(data: any, schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitizedData: any = {};

    for (const [field, rule] of Object.entries(schema)) {
      const value = data?.[field];
      const result = this.validateField(value, rule, field);

      if (!result.isValid && result.error) {
        errors.push(result.error);
      }

      if (result.sanitizedValue !== undefined) {
        sanitizedData[field] = result.sanitizedValue;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData,
    };
  }

  /**
   * Validate a single field
   */
  validateField(value: any, rule: FieldRule, fieldName: string = "field"): FieldResult {
    // Handle nullable
    if (value === null && rule.nullable) {
      return { isValid: true, sanitizedValue: null };
    }

    // Handle undefined
    if (value === undefined) {
      if (rule.required) {
        return {
          isValid: false,
          error: {
            field: fieldName,
            message: generateErrorMessage(fieldName, "required"),
            rule: "required",
            value,
          },
        };
      }
      if (rule.optional) {
        return { isValid: true, sanitizedValue: undefined };
      }
    }

    // Validate by type
    switch (rule.type) {
      case "string":
        return this.validateString(value, rule, fieldName);
      case "number":
        return this.validateNumber(value, rule, fieldName);
      case "boolean":
        return this.validateBoolean(value, rule, fieldName);
      case "date":
        return this.validateDate(value, rule, fieldName);
      case "array":
        return this.validateArray(value, rule, fieldName);
      case "object":
        return this.validateObject(value, rule, fieldName);
      case "enum":
        return this.validateEnum(value, rule, fieldName);
      case "custom":
        return this.validateCustom(value, rule, fieldName);
      default:
        return { isValid: false };
    }
  }

  /**
   * Sanitize data according to schema
   */
  sanitize(data: any, schema: ValidationSchema): any {
    const result = this.validate(data, schema);
    return result.sanitizedData;
  }

  /**
   * Validate many items with same schema
   */
  validateMany(
    items: any[],
    schema: ValidationSchema,
    options: BatchValidationOptions = {}
  ): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    const sanitizedItems: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const result = this.validate(items[i], schema);

      if (!result.isValid) {
        // Prefix field names with index
        const indexedErrors = result.errors.map((err) => ({
          ...err,
          field: `[${i}].${err.field}`,
        }));
        allErrors.push(...indexedErrors);

        if (options.stopOnFirstError) {
          break;
        }
      }

      allWarnings.push(...result.warnings);
      sanitizedItems.push(result.sanitizedData);
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      sanitizedData: sanitizedItems,
    };
  }

  // Private validation methods

  private validateString(value: any, rule: StringRule, fieldName: string): FieldResult {
    if (typeof value !== "string") {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "type"),
          rule: "type",
          value,
        },
      };
    }

    const sanitized = sanitizeString(value);

    // Check length
    if (rule.min !== undefined && sanitized.length < rule.min) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "min", rule.min),
          rule: "min",
          value,
        },
      };
    }

    if (rule.max !== undefined && sanitized.length > rule.max) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "max", rule.max),
          rule: "max",
          value,
        },
      };
    }

    // Check pattern
    if (rule.pattern && !rule.pattern.test(sanitized)) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "pattern"),
          rule: "pattern",
          value,
        },
      };
    }

    // Check email
    if (rule.email) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(sanitized)) {
        return {
          isValid: false,
          error: {
            field: fieldName,
            message: generateErrorMessage(fieldName, "email"),
            rule: "email",
            value,
          },
        };
      }
    }

    // Check URL
    if (rule.url) {
      try {
        new URL(sanitized);
      } catch {
        return {
          isValid: false,
          error: {
            field: fieldName,
            message: generateErrorMessage(fieldName, "url"),
            rule: "url",
            value,
          },
        };
      }
    }

    return { isValid: true, sanitizedValue: sanitized };
  }

  private validateNumber(value: any, rule: NumberRule, fieldName: string): FieldResult {
    const num = typeof value === "number" ? value : parseFloat(value);

    if (isNaN(num)) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "type"),
          rule: "type",
          value,
        },
      };
    }

    // Check integer
    if (rule.integer && !Number.isInteger(num)) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "integer"),
          rule: "integer",
          value,
        },
      };
    }

    // Check positive
    if (rule.positive && num <= 0) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "positive"),
          rule: "positive",
          value,
        },
      };
    }

    // Check min/max
    if (rule.min !== undefined && num < rule.min) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "min", rule.min),
          rule: "min",
          value,
        },
      };
    }

    if (rule.max !== undefined && num > rule.max) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "max", rule.max),
          rule: "max",
          value,
        },
      };
    }

    // Sanitize decimals
    const sanitized = rule.decimals !== undefined
      ? parseFloat(num.toFixed(rule.decimals))
      : num;

    return { isValid: true, sanitizedValue: sanitized };
  }

  private validateBoolean(value: any, rule: BooleanRule, fieldName: string): FieldResult {
    if (typeof value !== "boolean") {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "type"),
          rule: "type",
          value,
        },
      };
    }

    return { isValid: true, sanitizedValue: value };
  }

  private validateDate(value: any, rule: DateRule, fieldName: string): FieldResult {
    const date = value instanceof Date ? value : new Date(value);

    if (isNaN(date.getTime())) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "type"),
          rule: "type",
          value,
        },
      };
    }

    // Check min/max
    if (rule.min && date < rule.min) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "min", rule.min.toISOString()),
          rule: "min",
          value,
        },
      };
    }

    if (rule.max && date > rule.max) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "max", rule.max.toISOString()),
          rule: "max",
          value,
        },
      };
    }

    return { isValid: true, sanitizedValue: date };
  }

  private validateArray(value: any, rule: ArrayRule, fieldName: string): FieldResult {
    if (!Array.isArray(value)) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "type"),
          rule: "type",
          value,
        },
      };
    }

    // Check length
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "minLength", rule.minLength),
          rule: "minLength",
          value,
        },
      };
    }

    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "maxLength", rule.maxLength),
          rule: "maxLength",
          value,
        },
      };
    }

    // Validate items if itemType specified
    if (rule.itemType) {
      const sanitizedItems: any[] = [];
      for (let i = 0; i < value.length; i++) {
        const itemResult = this.validateField(
          value[i],
          rule.itemType,
          `${fieldName}[${i}]`
        );
        if (!itemResult.isValid) {
          return itemResult;
        }
        sanitizedItems.push(itemResult.sanitizedValue);
      }
      return { isValid: true, sanitizedValue: sanitizedItems };
    }

    return { isValid: true, sanitizedValue: value };
  }

  private validateObject(value: any, rule: ObjectRule, fieldName: string): FieldResult {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "type"),
          rule: "type",
          value,
        },
      };
    }

    // Check for extra keys in strict mode
    if (rule.strict) {
      const allowedKeys = Object.keys(rule.shape);
      const extraKeys = Object.keys(value).filter((k) => !allowedKeys.includes(k));
      if (extraKeys.length > 0) {
        return {
          isValid: false,
          error: {
            field: fieldName,
            message: `${fieldName} contains unexpected fields: ${extraKeys.join(", ")}`,
            rule: "strict",
            value,
          },
        };
      }
    }

    // Validate shape
    const sanitizedObject: any = {};
    for (const [key, keyRule] of Object.entries(rule.shape)) {
      const keyResult = this.validateField(value[key], keyRule, `${fieldName}.${key}`);
      if (!keyResult.isValid) {
        return keyResult;
      }
      if (keyResult.sanitizedValue !== undefined) {
        sanitizedObject[key] = keyResult.sanitizedValue;
      }
    }

    return { isValid: true, sanitizedValue: sanitizedObject };
  }

  private validateEnum(value: any, rule: EnumRule, fieldName: string): FieldResult {
    if (!rule.allowedValues.includes(value)) {
      return {
        isValid: false,
        error: {
          field: fieldName,
          message: generateErrorMessage(fieldName, "enum", rule.allowedValues),
          rule: "enum",
          value,
        },
      };
    }

    return { isValid: true, sanitizedValue: value };
  }

  private validateCustom(value: any, rule: CustomRule, fieldName: string): FieldResult {
    const result = rule.validator(value);

    if (result === true) {
      return { isValid: true, sanitizedValue: value };
    }

    return {
      isValid: false,
      error: {
        field: fieldName,
        message: typeof result === "string" ? result : `${fieldName} failed custom validation`,
        rule: "custom",
        value,
      },
    };
  }
}

// ============================================================================
// Pre-built Schemas
// ============================================================================

/**
 * Schema for trade parameters
 */
export const tradeParamsSchema: ValidationSchema = {
  symbol: {
    type: "string",
    required: true,
  },
  side: {
    type: "enum",
    required: true,
    allowedValues: ["buy", "sell"],
  },
  quantity: {
    type: "number",
    required: true,
    positive: true,
    decimals: 8,
  },
  price: {
    type: "number",
    required: true,
    positive: true,
    decimals: 8,
  },
  executedAt: {
    type: "date",
    required: true,
  },
  fee: {
    type: "number",
    required: true,
    min: 0,
    decimals: 8,
  },
  feeCurrency: {
    type: "string",
    optional: true,
  },
  metadata: {
    type: "object",
    optional: true,
    shape: {},
  },
};

/**
 * Schema for order parameters
 */
export const orderParamsSchema: ValidationSchema = {
  symbol: {
    type: "string",
    required: true,
  },
  side: {
    type: "enum",
    required: true,
    allowedValues: ["buy", "sell"],
  },
  type: {
    type: "enum",
    required: true,
    allowedValues: [
      "market",
      "limit",
      "stop-loss",
      "stop-limit",
      "take-profit",
      "trailing-stop",
    ],
  },
  quantity: {
    type: "number",
    required: true,
    positive: true,
    decimals: 8,
  },
  price: {
    type: "number",
    optional: true,
    positive: true,
    decimals: 8,
  },
  stopPrice: {
    type: "number",
    optional: true,
    positive: true,
    decimals: 8,
  },
  timeInForce: {
    type: "enum",
    required: true,
    allowedValues: ["gtc", "ioc", "fok", "day"],
  },
};

/**
 * Schema for portfolio parameters
 */
export const portfolioParamsSchema: ValidationSchema = {
  assets: {
    type: "array",
    required: true,
    minLength: 1,
    itemType: {
      type: "object",
      shape: {
        symbol: { type: "string", required: true },
        quantity: { type: "number", required: true, positive: true },
        averagePrice: { type: "number", required: true, positive: true },
      },
    },
  },
  totalValue: {
    type: "number",
    required: true,
    positive: true,
  },
  cash: {
    type: "number",
    required: true,
    min: 0,
  },
};

/**
 * Schema for strategy parameters
 */
export const strategyParamsSchema: ValidationSchema = {
  name: {
    type: "string",
    required: true,
    min: 3,
    max: 100,
  },
  type: {
    type: "enum",
    required: true,
    allowedValues: [
      "market-making",
      "arbitrage",
      "statistical-arbitrage",
      "trend-following",
      "mean-reversion",
      "momentum",
      "scalping",
    ],
  },
  riskLevel: {
    type: "enum",
    required: true,
    allowedValues: ["conservative", "moderate", "aggressive"],
  },
  maxPositionSize: {
    type: "number",
    optional: true,
    positive: true,
  },
  parameters: {
    type: "object",
    required: true,
    shape: {},
  },
  assets: {
    type: "array",
    optional: true,
    itemType: { type: "string" },
  },
};

// ============================================================================
// Exports
// ============================================================================

// Create singleton validator instance
export const validator = new Validator();

// Export everything
export default validator;