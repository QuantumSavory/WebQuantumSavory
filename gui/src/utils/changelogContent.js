const injectedChangelog = typeof __WEBQUANTUMSAVORY_CHANGELOG__ === 'string'
  ? __WEBQUANTUMSAVORY_CHANGELOG__
  : ''

export const changelogMarkdown = injectedChangelog
