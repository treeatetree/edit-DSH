# Agent Note: 移动端与折叠屏 Web 外壳

Status: implemented

[English](2026-08-14-mobile-fold-shell.md) | 中文

## 问题

Web 外壳是三栏 AppFrame，在 1024px 以下收成 56px 轨道。在手机上这条轨道仍占用水平空间，会话列表不是抽屉，输入框压在 Home 指示条下，双段折叠屏仍使用忽略铰链的单一网格。用户还需要一个显式的 compact／desktop 覆盖，重载后仍然有效，且不持久化拖动宽度。

## 决策

**三种绘制模式，一项存储偏好。** `resolveShellMode` 把 `shellPreference` 加上视口事实映射为 `compact`、`split` 或 `desktop`。强制的 `compact`／`desktop` 优先。auto 在 `(horizontal-viewport-segments: 2)` 匹配时绘制 `split`，在低于 720px 或粗指针且低于 1024px 时绘制 `compact`，否则绘制 `desktop`（含细指针在 1024px 以下的既有轨道）。只有 `dsh.layout.shellPreference` 写入 `localStorage`；面板宽度仍只在进程内有效。

**Compact 是叠放浮层，不是被挤窄的三栏。** AppFrame 只绘制一列。`ui-sidebar` 收到 `presentation: 'drawer'`，绘制底栏加覆盖式会话列表。`--dsh-shell-gutter-bottom` 抬高输入框和 `center.cover`。详情栏打开时以实底叠在会话上。当前 Session id 变化会关闭抽屉。Compact 与 split 不绘制拖动手柄。

**Split 使用 CSS viewport segments。** 侧边栏占用第 0 段；会话栏与详情浮层共用第 1 段。铰链间隙为 `env(viewport-segment-left 1 0) - env(viewport-segment-left 0 0) - env(viewport-segment-width 0 0)`。能匹配该媒体查询但不解析这些 env 的浏览器会回退到 40% / `minmax(0, 1fr)`，且没有间隙。

**布局切换会跳过无效档位。** `nextDistinctShellPreference` 写入下一个会真正改变绘制结果的偏好，因此手机上的 auto 会跳到 desktop，而不是先进入强制 compact。

跨插件写入面是 `ILayout.setShellPreference`。主题呈现器会在已有 viewport meta 上追加 `viewport-fit=cover`，以便定义 `safe-area-inset-bottom`。

## 曾考虑的替代方案

**只用 CSS `@media (max-width: 720px)` 重排三栏。** 不采用：会话列表、底栏、详情浮层和折叠跨段需要不同的 slot owner props 与命中目标，而不是更窄的轨道。

**把面板宽度和新偏好一起持久化。** 不采用：既有 store 约定让几何信息保持进程内有效；混在一起会在手机上重载后恢复桌面拖动后的挤窄布局。

**把 compact／desktop 做成设置项而不是 chrome 控件。** 不采用：切换必须能从 compact 底栏本身够到，包括设置面板关闭时。

**把粗指针 1024px 内屏当成 desktop。** 不采用：内屏仍以触摸为主；compact chrome 直到 1024px 与既有自动收起断点一致。

## 后果

手机和折叠外屏得到底栏和会话抽屉。双段折叠把导航放在一半、对话放在另一半。桌面用户保留三栏外壳，也可以强制 compact。覆盖部署必须同时带上 `ui-layout`、`ui-sidebar`，以及消费 `--dsh-shell-gutter-bottom` 的输入框／市场 CSS。

## 测试

包内测试覆盖偏好解析／循环／持久化、`resolveShellMode` 与 `nextDistinctShellPreference`、AppFrame 的 compact／split／强制 desktop、compact 详情浮层、会话变化关闭抽屉、matchMedia 更新，以及 `ui-sidebar` 中的 compact 抽屉／底栏。无密钥 web e2e `compact-shell` 以 390×844 视口启动，快照 `[data-compact-nav]`，并点击布局切换到 `data-shell=desktop`。覆盖缺口仍是真实双段折叠设备和针对 `env(viewport-segment-*)` 的铰链间隙测量。
