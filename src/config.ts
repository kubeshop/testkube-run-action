export const defaultInstance: string = 'cloud.testkube.io';

export const instanceAliases: Record<string, string> = {
  'api.testkube.io': 'cloud.testkube.io',
  'api.testkube.xyz': 'cloud.testkube.xyz',
  'api.testkube.dev': 'cloud.testkube.dev',
};

export const knownInstances: Record<string, {api: string, ws: string, dashboard: string}> = {
  'cloud.testkube.io': {
    api: 'https://api.testkube.io',
    ws: 'wss://websockets.testkube.io',
    dashboard: 'https://cloud.testkube.io',
  },
  'cloud.testkube.xyz': {
    api: 'https://api.testkube.xyz',
    ws: 'wss://websockets.testkube.xyz',
    dashboard: 'https://cloud.testkube.xyz',
  },
  'cloud.testkube.dev': {
    api: 'https://api.testkube.dev',
    ws: 'wss://websockets.testkube.dev',
    dashboard: 'https://cloud.testkube.dev',
  },
};

export const knownSuffixes: string[] = ['', '/v1', '/results/v1'];

export const runningContext = {type: 'github-run-action', context: 'github-run-action'};
