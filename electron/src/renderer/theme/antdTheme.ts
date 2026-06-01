import type { ThemeConfig } from 'antd'

export const hermesTheme: ThemeConfig = {
  token: {
    // Colors
    colorPrimary: '#ff7a3d',
    colorBgBase: '#050403',
    colorBgContainer: '#11100e',
    colorBgElevated: '#1a1816',
    colorBgSpotlight: '#232120',
    colorBgLayout: '#050403',
    colorBorder: '#2a2725',
    colorBorderSecondary: '#3a3633',
    colorText: '#e8e2d4',
    colorTextSecondary: '#aaa291',
    colorTextTertiary: '#6d6759',
    colorTextQuaternary: '#5a554f',
    colorSuccess: '#8db580',
    colorWarning: '#e8b85d',
    colorError: '#d96666',
    colorInfo: '#6e9bd1',

    // Typography
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontFamilyCode: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    fontSize: 14,

    // Sizing
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    borderRadiusXS: 4,
    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,

    // Spacing
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    paddingXS: 8,
    paddingXXS: 4,

    // Links
    colorLink: '#ff7a3d',
    colorLinkHover: '#ff9a6a',
    colorLinkActive: '#e86a30',

    // Motion
    motionDurationFast: '0.1s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
    motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    motionEaseOut: 'cubic-bezier(0, 0, 0.2, 1)',
  },
  components: {
    Layout: {
      headerBg: '#0a0908',
      headerColor: '#e8e2d4',
      headerHeight: 52,
      siderBg: '#0a0908',
      bodyBg: '#050403',
      footerBg: '#0a0908',
      headerPadding: '0 16px',
      headerPaddingInline: 16,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(255, 122, 61, 0.1)',
      darkItemHoverBg: '#11100e',
      darkItemColor: '#aaa291',
      darkItemSelectedColor: '#ff7a3d',
      darkItemHoverColor: '#e8e2d4',
      itemBorderRadius: 8,
      itemPaddingInline: 12,
      itemMarginBlock: 2,
      iconSize: 16,
      iconMarginInlineEnd: 8,
    },
    Button: {
      primaryShadow: '0 2px 8px rgba(255, 122, 61, 0.25)',
      defaultShadow: 'none',
      borderRadius: 8,
      controlHeight: 36,
      paddingContentHorizontal: 16,
      paddingContentVertical: 8,
    },
    Input: {
      colorBgContainer: '#11100e',
      colorBgContainerDisabled: '#1a1816',
      activeBorderColor: '#ff7a3d',
      hoverBorderColor: '#ff9a6a',
      activeShadow: '0 0 0 2px rgba(255, 122, 61, 0.1)',
    },
    InputNumber: {
      colorBgContainer: '#11100e',
    },
    Select: {
      colorBgContainer: '#11100e',
      colorBgElevated: '#1a1816',
      optionSelectedBg: 'rgba(255, 122, 61, 0.12)',
      optionActiveBg: '#11100e',
      optionPadding: '6px 12px',
    },
    Modal: {
      contentBg: '#11100e',
      headerBg: '#11100e',
      titleColor: '#e8e2d4',
      footerBg: '#11100e',
      borderRadiusLG: 12,
    },
    Drawer: {
      colorBgElevated: '#11100e',
    },
    Table: {
      headerBg: '#0a0908',
      headerColor: '#e8e2d4',
      headerSortActiveBg: '#11100e',
      headerSortHoverBg: '#11100e',
      rowHoverBg: '#11100e',
      bodySortBg: '#050403',
      borderColor: '#2a2725',
      headerBorderRadius: 0,
    },
    Card: {
      colorBgContainer: '#11100e',
      colorBorderSecondary: '#2a2725',
    },
    Tabs: {
      inkBarColor: '#ff7a3d',
      itemActiveColor: '#ff7a3d',
      itemHoverColor: '#ff9a6a',
      itemSelectedColor: '#ff7a3d',
      itemColor: '#aaa291',
      horizontalItemPadding: '12px 0',
      horizontalMargin: '0 0 0 24px',
    },
    Dropdown: {
      colorBgElevated: '#1a1816',
      controlItemBgHover: '#232120',
      controlItemBgActive: 'rgba(255, 122, 61, 0.1)',
      controlItemActiveBg: 'rgba(255, 122, 61, 0.12)',
    },
    Tag: {
      defaultBg: '#232120',
      defaultColor: '#e8e2d4',
    },
    Badge: {
      colorBgContainer: '#11100e',
    },
    Tooltip: {
      colorBgSpotlight: '#1a1816',
      colorTextLightSolid: '#e8e2d4',
    },
    Popover: {
      colorBgElevated: '#1a1816',
    },
    Message: {
      contentBg: '#1a1816',
    },
    Notification: {
      colorBgElevated: '#1a1816',
    },
    Slider: {
      trackBg: '#3a3633',
      trackHoverBg: '#4a4541',
      handleColor: '#ff7a3d',
      handleActiveColor: '#ff9a6a',
      railBg: '#2a2725',
      railHoverBg: '#3a3633',
    },
    Switch: {
      colorPrimary: '#ff7a3d',
      colorPrimaryHover: '#ff9a6a',
      handleSize: 18,
    },
    Checkbox: {
      colorBgContainer: '#11100e',
      colorBorder: '#3a3633',
    },
    Radio: {
      colorBgContainer: '#11100e',
      colorBorder: '#3a3633',
    },
    Tree: {
      colorBgContainer: '#11100e',
      directoryNodeSelectedBg: 'rgba(255, 122, 61, 0.08)',
      nodeSelectedBg: 'rgba(255, 122, 61, 0.08)',
    },
    List: {
      colorBgContainer: '#11100e',
    },
    Statistic: {
      colorTextDescription: '#aaa291',
    },
    Skeleton: {
      gradientFromColor: '#1a1816',
      gradientToColor: '#232120',
    },
    Progress: {
      remainingColor: '#2a2725',
    },
    Segmented: {
      itemActiveBg: 'rgba(255, 122, 61, 0.1)',
      itemSelectedBg: '#11100e',
      itemSelectedColor: '#ff7a3d',
      itemColor: '#aaa291',
      itemHoverColor: '#e8e2d4',
      itemHoverBg: '#1a1816',
    },
  },
}
