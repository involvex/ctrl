import { defineConfig } from 'vitepress';

const base = process.env['DOCS_BASE'] ?? '/ctrl/';

export default defineConfig({
  title: 'ctrl',
  description: 'Local agent platform — Bun gateway, Electron, Expo, CLI',
  base,
  cleanUrls: true,
  ignoreDeadLinks: true,
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.svg` }],
    ['meta', { name: 'theme-color', content: '#000000' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: 'ctrl',
    nav: [
      { text: 'Plan', link: '/Plan' },
      { text: 'CI & Releases', link: '/ci-and-releases' },
      { text: 'Security', link: '/security' },
      { text: 'Sponsor', link: '/funding' },
      {
        text: 'GitHub',
        link: 'https://github.com/involvex/ctrl',
      },
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Plan', link: '/Plan' },
          { text: 'Namespace & Design', link: '/Namespace_and_Design' },
          { text: 'Code Quality', link: '/CodeQuality' },
        ],
      },
      {
        text: 'Ops',
        items: [
          { text: 'CI & Releases', link: '/ci-and-releases' },
          { text: 'Security', link: '/security' },
          { text: 'Threat Model', link: '/threat-model' },
          { text: 'Sponsor / Funding', link: '/funding' },
        ],
      },
      {
        text: 'ADRs',
        items: [
          {
            text: '0002 Naming & Publish',
            link: '/adr/ADR-0002-ctrl-naming-and-publish',
          },
          {
            text: '0003 Bun-native Quality',
            link: '/adr/ADR-0003-bun-native-quality',
          },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/involvex/ctrl' }],
    footer: {
      message: 'Local agent platform under @involvex',
      copyright: 'Sponsors → /funding · Security → /security',
    },
    search: {
      provider: 'local',
    },
  },
  appearance: 'dark',
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
});
