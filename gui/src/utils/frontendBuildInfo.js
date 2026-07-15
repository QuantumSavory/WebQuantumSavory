const injectedBuildInfo = typeof __WEBQUANTUMSAVORY_BUILD_INFO__ === 'object'
  ? __WEBQUANTUMSAVORY_BUILD_INFO__
  : {}

export const frontendBuildInfo = {
  appVersion: typeof injectedBuildInfo.appVersion === 'string'
    ? injectedBuildInfo.appVersion
    : 'Unknown',
  dependencies: {
    runtime: injectedBuildInfo.dependencies?.runtime ?? {},
    development: injectedBuildInfo.dependencies?.development ?? {},
  },
}
