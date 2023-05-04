export const defaultInstance: string = 'cloud.testkube.io';

export const instanceAliases: Record<string, string> = {
  'api.testkube.io': 'cloud.testkube.io',
  'api.testkube.xyz': 'cloud.testkube.xyz',
};

export const knownInstances: Record<string, {api: string, ws: string}> = {
  'cloud.testkube.io': {
    api: 'https://api.testkube.io',
    ws: 'wss://websockets.testkube.io',
  },
  'cloud.testkube.xyz': {
    api: 'https://api.testkube.xyz',
    ws: 'wss://websockets.testkube.xyz',
  },
};

export const knownSuffixes: string[] = ['', '/v1', '/results/v1'];

export const runningContext = {type: 'testtrigger', context: 'GitHub Action'};
