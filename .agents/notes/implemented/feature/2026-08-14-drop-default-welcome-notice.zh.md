# Agent Note: 取消默认内测声明

Status: implemented

[English](2026-08-14-drop-default-welcome-notice.md) | 中文

## 问题

`ui-settings-models` 把 `welcome-notice` 注册为 `settings.onboarding` 的第一步。回环客户端把确认写入 `ui-onboarding.welcomeNoticeVersion`，但远程或反代浏览器使用进程内内存，因此每次重载都会再次挂载「内测声明」弹窗。这就是公开 Web 部署的默认体验。

## 决策

默认 `apply` 只在 `settings.onboarding` 中注册 `deepseek-official`。`WelcomeNotice`、`welcome-store` 与 `onboarding-copy.ts` 仍留在包内供单测使用，但不是 slot 占用。Host 的 `ui-onboarding` 分节和 `welcomeNoticeVersion` 字段保留；默认客户端不会写入它们。

这部分取代了[共用弹窗的产品引导](2026-08-13-shared-modal-product-onboarding.md)：共用弹窗和凭据步骤保留；声明不再是默认已发布步骤。历史上的[全屏内测声明移除](../simplification/2026-08-13-remove-first-run-beta-notice.md)已经去掉了接管式布局和遥测文案。

## 曾考虑的替代方案

**把远程确认写入 `localStorage`，让声明每个浏览器只出现一次。** 不采用：用户要求的是停止弹窗，而不是记住它；远程持久化还会扩大共用弹窗 note 保持在 Host settings API 上的引导约定。

**只在回环挂载该步骤。** 不采用：同一份客户端包同时服务两者，而且仅限回环的占用仍会让已经在远程部署上看过声明、却还没有可用提供方的人再次吃惊。

**删除 `WelcomeNotice` 和 Host 字段。** 不采用：这超出产品要求的清理范围；包内测试仍钉住文案、store 和弹窗包装，未读的持久化字段无害。

## 后果

远程重载不再打开「内测声明」。没有可用提供方的首次用户仍会看到 DeepSeek 密钥弹窗。曾经用 `welcomeNoticePending: true` 到达后续 chrome 的场景现在会直接进入该 chrome 或凭据步骤。

## 测试

`ui-settings-models` 的 apply 测试期望只有 `deepseek-official` 占用，且没有 `welcome-notice` id。`WelcomeNotice` 单测仍直接挂载该组件。Web e2e `onboarding-deepseek-config` 断言声明缺席后完成密钥写入；`remote-welcome` 断言非回环 authority 上从不挂载该声明。原先的 `welcome.expected.md` golden 已删除。
