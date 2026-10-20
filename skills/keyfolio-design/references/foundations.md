# 色彩、排印与材质基础

## 语义中性色

桌面背景是空间光场，不能只用一个 HEX 代替。浅色内容区接近 #F1F1F3，顶部更亮；暗色底部角落接近 #0A0A0D，顶部柔光带略冷。下面的值是控件与表面的 token，不是整张桌面的最终像素。

| Token / 角色 | 浅色主题 | 暗色主题 |
| --- | --- | --- |
| ink / 主文字 | #141416 | #FFFFFF |
| text2 / 次文字、普通图标 | #56565E | #A2A2AB |
| text3 / 占位、辅助数值 | #6C6C74 | #8A8A94 |
| field / 顶部搜索底 | #FFFFFF | white / 5.5% |
| fieldLine / 搜索与图标按钮边 | #DFDFE4 | white / 10% |
| fieldFocusLine | #141416 | #FFFFFF |
| primaryBg / 主按钮、选中 chip | #141416 | #FFFFFF |
| primaryFg / 主操作文字 | #FFFFFF | #131316 |
| chipOffBg / 普通筛选底 | black / 6% | white / 7.5% |
| chipOffFg | #56565E | #A2A2AB |
| dashed / 新增卡虚线 | #C9C9D0 | #3A3A44 |
| rowBg / 列表行 | #FFFFFF | white / 3% |
| rowRing / 列表边 | #E8E8EC | white / 7% |
| rowRingActive | #141416 | white / 34% |
| keyPillBg / 标识底 | #F2F2F5 | white / 7% |
| keyPillFg | #3A3A42 | #C9C9D2 |
| sheetBg / 模态主表面 | #FFFFFF | #1B1B1F |
| sheetLine | #ECECEF | #26262C |
| sheetFooter | #FAFAFB | #17171B |
| inputBg / 表单底 | #FFFFFF | #1E1E23 |
| inputLine / 表单边 | #DFDFE4 | #2E2E36 |
| inputActiveBg | #FAFAFB | #131316 |
| inputActiveLine | #141416 | #FFFFFF |
| secondaryLine / 次按钮边 | #DFDFE4 | #2E2E36 |
| secondaryFg | #141416 | #FFFFFF |

顶部图标按钮复用 field / fieldLine，图标复用 text2。暗色透明表面要叠在连续桌面上，不能在迁移时直接替换成任意灰色块。原项目列表行有两层同色绘制，最终有效填充约 6%；移植时按实际图层合成校准，不把 3% 当成最终像素。

菜单栏弹出面板另用稳定暗底 #131316；不要把这个专用值当成主窗口的统一底色。完整详情色阶由对象的 DetailTint 派生。

这套体系允许近中性冷灰、纯白主按钮和白色主文字。卡面白字是明确规则；“纯白只能用于 hover”“所有暗底必须纯黑”属于其他设计体系。

## 语义状态色

这些 token 用在中性表面。彩色卡面内的状态应按相同语义重新保证对比，不直接叠上不透明的错误大色块。

| 状态 | 浅色 bg / fg / dot | 暗色 bg / fg / dot |
| --- | --- | --- |
| 错误 | #FBEDEA / #A3251A / #C0362A | #2C1512 / #FF9E95 / #FF6B5E |
| 警告 | #FBF3E6 / #7A4E00 / #B07B1E | #2A2113 / #F5CE86 / #F0B857 |
| 中性 | #F2F2F5 / #56565E / #B8B8C0 | #24242A / #A2A2AB / #5A5A63 |

警告说明文字可用 #6B4A0D / #F5CE86，收藏星色可用 #8A5E00 / #F0B857。语义色和身份色各司其职，不能因为对象本身是红色就自动表示错误。

## 厂商色与双色转向

这些是 Keyfolio 源码中的 rich / deep 字面值与副光色相转角；不是当前官方品牌规范，也不是最终卡面渐变的两个端点。迁移其他产品时选取其实体自己的颜色关系。

| 对象 | rich | deep | 副光色相转角 |
| --- | --- | --- | --- |
| OpenAI | #10A37F | #04170F | +10° |
| Claude | #D97757 | #1B0D07 | −8° |
| Gemini | #9A6BE0 | #120B22 | +22° |
| DeepSeek | #3B82F6 | #050E20 | −13° |
| Kimi | #A7B4CC | #0B0D13 | +22° |
| Groq | #F55036 | #1C0703 | −30° |
| TypeSafe Jev | #E5A614 | #191104 | −3° |
| NVIDIA NIM | #86D400 | #0F1A03 | +28° |
| Azure OpenAI | #0FA0E8 | #04131E | −21° |
| 智谱 GLM | #5B67F2 | #08091F | +28° |
| MiniMax | #EC4D7A | #1F060F | −20° |
| DeepL | #23A8B8 | #031517 | −6° |
| 自定义 | #9A9AA3 | #0E0E11 | +56° |
| 未知 | #7E7E88 | #0C0C0F | 0° |

主光不是把 rich 加白。ProviderPalette 在 OKLab 中控制亮度、色度与色相，均衡蓝紫、绿色、琥珀等颜色的感知强度。银灰对象保留轻微带色的光心，未知对象更安静，不能变成一块灰白雾斑。

### 可迁移的构色方法

精确复刻时使用源项目的 OKLab、ProviderPalette、CardLight 和 LightGeometry；下面给出足够支持新实现的关系与关键量，不代替完整算法：

- 卡片未受光底：OKLab L = 0.165（浅主题中的卡）或 0.205（暗主题中的卡）；色相来自 deep，C = min(Cdeep × 0.75, 0.036)。两种主题中的卡片都偏深。
- 彩色主光源：原色 C 上限 0.20、彩色对象下限约 0.13；亮度围绕 0.705 按色相修正约 ±0.035。近灰对象逐步转为银色，不能套用彩色下限。
- 副光：在主光色相上加表中转角，色度约为主光 × 1.12，亮度围绕 0.66 按色相修正；近灰对象另行降低。
- 光沿强度衰减时，色度按 intensity^0.68 保留，尾部向副色偏转；高光中心额外抬亮但不泛白。主副光分别成层，不能用一条对角线线性渐变代替。
- 身份色相近时，通过副光方向与光形拉开距离，同时维持文字区的共同深色基底。

静态迁移可以采用多个柔和径向渐变和深色遮光层近似这些关系，但需要检查实际显示，并明确其为风格迁移。精确还原还涉及近灰光心、色域映射、光形与光层叠加。

## 排印

| 角色 | 字体 | 用法 |
| --- | --- | --- |
| 拉丁 UI | Space Grotesk | 常规文字 400；重点 500–700 |
| 中文 UI | PingFang SC | 显式匹配对应字重，辅助文字保持 Regular |
| 密钥、host、快捷键等机器标识 | JetBrains Mono | 精确对齐，常规 Regular |
| 缺失字体回退 | 系统 sans / 系统 mono | 重新核对实际宽度和行高 |

macOS 使用 fixedSize 保留 12.5 等半点字号；不要因默认自定义字体取整让密钥行变宽。不要把中文辅助说明套成 monospace。Space Grotesk 缺少 Regular 时应补齐可用字体或明确回退，不把 Medium 误当普通正文的设计要求。

关键行盒：中文 1.4 × font size，纯拉丁 1.276 ×，mono 1.32 ×。SwiftUI 中需要显式处理字体自然行高与行盒的差异；Web 先以对应 line-height 建立节奏，按实际回退字体核对。

图标以 24 单位网格的轻描边为基底，线宽约 1.6–2.4，按图形视觉重量调整；保留少量填充星标与重点图标。避免混用视觉重量差异显著的图标集。

## 表面、边缘和阴影

彩色卡片上的小圆钮或胶囊：白色 wash 8.5%，增强时 17%。卡片边缘：浅色主题用顶部 1 宽白光切面、透明度约 10%；暗色主题用白色约 10% 的完整细环。

以下是 CSS 等价投影；浅色投影基色为 rgb(20,20,22)，暗色为 black：

| 状态 | 浅色主题 | 暗色主题 |
| --- | --- | --- |
| 静置卡片 | 0 10px 26px / 20% | 0 12px 28px / 50% |
| 选中卡片（未 hover） | 0 10px 26px / 24% | 0 12px 28px / 55% |
| hover 卡片 | 0 18px 38px / 26% | 0 20px 44px / 60% |
| Hero | 0 10px 26px / 22% | 0 12px 28px / 50% |

浅色静置、未选中卡片另有 0 1px 2px / 26% 接触阴影。hover 的外层可加 1 宽白色 8% 细环。SwiftUI shadow radius 使用 CSS blur / 2；不要直接把 38 填进 radius。

默认圆角族：小控件 8–10，hero / 模态 16，网格卡 18；具体尺寸见 components.md。不要为所有矩形统一套最大圆角，保留表面与操作的区别。

## 来源

提取日期：2026-10-20。源项目 Keyfolio macOS 原项目的 ApiKeyManager.swift 的设计实现。

- KFTheme（约 277–481）、MenuPanelTheme：语义色与局部表面。
- KFFont（约 506–612）、KFLine（约 8558）、KFIcon：字体、行盒与图标。
- ProviderPalette（约 649–767）、ApiProvider.lightTurn（约 820）、ApiProvider.palette（约 5658）：颜色原料与构色关系。
- KFFace、KFShadow、KFTopHighlight、GridCardDepth：wash、边缘、阴影。
- DeskLight：实际桌面底色与受光。背景概述来自源码模型，不是截图取样。

文件行号会随项目变化；用符号定位更新。此文是设计提炼，不表示已对所有主题或光效运行视觉验收。
