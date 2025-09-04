// backend/src/utils/fieldConverter.ts

// A robust utility to recursively convert object keys between camelCase and snake_case.
// This is a critical part of the V2.0 refactoring to ensure data consistency.
// The backend service logic uses camelCase, while the database and API use snake_case.

const isObject = (o: any): o is Object => o === Object(o) && !Array.isArray(o) && typeof o !== 'function' && !(o instanceof Date);

const toCamel = (s: string): string => {
  return s.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
};

const toSnake = (s: string): string => {
  // 特殊处理：单个大写字母（选项键）不转换
  if (/^[A-Z]$/.test(s)) {
    return s;
  }
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

/**
 * Converts incoming snake_case request data to camelCase for use in the service layer.
 */
export const processRequestData = (data: any): any => {
  return keysToCamel(data);
};

/**
 * Converts outgoing camelCase data from the service layer to snake_case for the API response.
 */
export const prepareResponseData = (data: any): any => {
  return keysToSnake(data);
};
