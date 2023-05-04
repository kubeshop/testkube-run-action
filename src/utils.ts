import * as write from './write';
import {Variable} from './types';

export function maybeParse(str: string, defaultValue?: any): any {
  try {
    return JSON.parse(str);
  } catch (e) {
    return undefined;
  }
}

export function sanitizeUrl(url: string, protocol: string): string {
  url = url.replace(/\/+$/, '');

  const [,currentProtocol] = url.match(/^([^:]+):\/\//) || [];

  if (!currentProtocol) {
    url = `${protocol}://${url}`;
  } else if (currentProtocol !== protocol && currentProtocol !== `${protocol}s`) {
    // TODO: Edge case, but ws:// may become https://
    url = `${protocol}${currentProtocol.endsWith('s') ? 's' : ''}://${url.substring(currentProtocol.length + 3)}`;
  }

  return url;
}

export function handleHttpError(error: any): never {
  return write.critical(maybeParse(error?.response?.body)?.detail || error);
}

export function formatVariables(basicVariables?: Record<string, string>, secretVariables?: Record<string, string>): Record<string, Variable> {
  const variables: Record<string, Variable> = {};
  for (const [name, value] of Object.entries(basicVariables || {})) {
    variables[name] = {name, type: 'basic', value};
  }
  for (const [name, value] of Object.entries(secretVariables || {})) {
    variables[name] = {name, type: 'secret', value};
  }
  return variables;
}
