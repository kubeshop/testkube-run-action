export const defaultInstance: string = 'app.testkube.io';

export const instanceAliases: Record<string, string> = {
  'api.testkube.io': 'app.testkube.io',
  'api.testkube.xyz': 'app.testkube.xyz',
  'api.testkube.dev': 'app.testkube.dev',

  // Backwards compatibility
  'cloud.testkube.io': 'app.testkube.io',
  'cloud.testkube.xyz': 'app.testkube.xyz',
  'cloud.testkube.dev': 'app.testkube.dev',
};

export const knownInstances: Record<string, {api: string, ws: string, dashboard: string}> = {
  'app.testkube.io': {
    api: 'https://api.testkube.io',
    ws: 'wss://websockets.testkube.io',
    dashboard: 'https://app.testkube.io',
  },
  'app.testkube.xyz': {
    api: 'https://api.testkube.xyz',
    ws: 'wss://websockets.testkube.xyz',
    dashboard: 'https://app.testkube.xyz',
  },
  'app.testkube.dev': {
    api: 'https://api.testkube.dev',
    ws: 'wss://websockets.testkube.dev',
    dashboard: 'https://app.testkube.dev',
  },
};

export const knownSuffixes: string[] = ['', '/v1', '/results/v1'];

export const runningContext = {type: 'github-run-action', context: 'github-run-action'};
