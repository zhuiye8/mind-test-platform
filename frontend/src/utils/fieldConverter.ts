// frontend/src/utils/fieldConverter.ts

// A robust utility to recursively convert object keys between camelCase and snake_case.
// This is a critical part of the V2.0 refactoring to ensure data consistency 
// between the frontend (camelCase) and the backend API (snake_case).

const isObject = (o: any): o is Object => o === Object(o) && !Array.isArray(o) && typeof o !== 'function';

const toCamel = (s: string): string => {
  return s.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
};

const toSnake = (s: string): string => {
  return s.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

const convertKeys = (o: any, converter: (key: string) => string): any => {
  if (isObject(o)) {
    const n: { [key: string]: any } = {};
    Object.keys(o)
      .forEach((k) => {
        n[converter(k)] = convertKeys((o as any)[k], converter);
      });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => {
      return convertKeys(i, converter);
    });
  }
  return o;
};

export const keysToCamel = (o: any): any => convertKeys(o, toCamel);
export const keysToSnake = (o: any): any => convertKeys(o, toSnake);

// V2.0: Compatibility mappings removed - all naming now unified

// V2.0: applyMapping function removed - no longer needed

/**
 * Processes raw API response data for frontend use.
 * V2.0: Simplified - only converts keys to camelCase.
 */
export const processResponseData = (data: any): any => {
  return keysToCamel(data);
};

/**
 * Prepares frontend data to be sent to the API.
 * 1. Converts all keys to snake_case.
 */
export const prepareRequestData = (data: any): any => {
  return keysToSnake(data);
};
