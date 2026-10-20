# 搜索框的光池与边缘光

用于实现或迁移 Keyfolio 搜索框的完整光效。这里区分原版设计参数和 Web 近似；尺寸变化时保留光层关系，优先保证输入和焦点可见。

## 先搭好四层

由后向前分别是：宽光池、胶囊边缘光、输入框本体、文字与图标。所有装饰层设为 pointer-events: none、aria-hidden；发光不能成为输入的点击遮罩。

- **宽光池**：围绕输入框中心的柔和椭圆，让搜索框坐在环境光里。
- **边缘光**：光强在胶囊轮廓附近最高，向外平缓衰减，向内很快变弱。
- **本体**：420 × 38 的桌面基准，圆角为高度一半。暗色采用轻透明表面，浅色为白色。
- **细线与内容**：本体有 1px 轮廓；聚焦只改变光强和对比，不改变尺寸、字重、内边距或文字位置。

外层为光池留出空间，不能把整个组件 clip 到 38px 高；只裁切输入框本体。手机端缩减本体宽度，保持高度与圆形端帽。

## 宽光池怎么画

原版使用 256 × 256 的透明椭圆纹理，再伸展到输入框宽的 2.4 倍、高的 6 倍。纹理中心对齐输入框中心。归一化半径 r 的强度：

```js
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function haloProfile(r) {
  if (r >= 1) return 0;
  return Math.exp(-(r * r) / (2 * 0.30 ** 2))
    * (1 - smoothstep(0.7, 1, r));
}
```

高斯核心提供柔软中心，后段 smoothstep 保证边缘平滑归零。只画一圈径向渐变硬边，会出现可见椭圆；提高整个纹理透明度太多，则会把胶囊背后照成一块雾白平板。

光池颜色继承当前环境：桌灯是轻冷色，选中或预览厂商时取对应光色。暗色叠加为柔光，浅色以轻微带色的阴影呈现。不能直接把鲜艳品牌 HEX 以高不透明度铺满光池。

## 胶囊边缘光怎么画

按像素到胶囊边界的有符号距离 d 计算；d 为 0 时在轮廓上，正数在外，负数在内。胶囊的距离函数可写为：

```js
// x、y 以胶囊中心为原点，w、h 是本体尺寸。
function capsuleDistance(x, y, w, h) {
  const r = h / 2;
  const qx = Math.max(Math.abs(x) - (w / 2 - r), 0);
  return Math.hypot(qx, y) - r;
}

function rimIntensity(d) {
  if (d < 0) {
    const edge = (0.34 + 0.40 - 0.10)
      * Math.exp(-(d * d) / (2 * (2.2 * 0.55) ** 2));
    return edge + 0.10 * Math.exp(-(d * d) / (2 * 4.5 ** 2));
  }
  const near = 0.34 * Math.exp(-(d * d) / (2 * 2.2 ** 2));
  const far = 0.40 * Math.exp(-(d * d) / (2 * 17 ** 2));
  return (near + far) * (1 - smoothstep(42 * 0.6, 42, d));
}
```

近处窄峰保留边缘的锐度，远处宽峰构成柔和光晕，42px 处完全消散。内部只保留一点接光，不要照亮文字区域。色彩从轮廓的明亮光心，过渡到较深的外泛光，再向厂商副色偏转；在 OKLab 中插值能更好保留亮度与色相关系。

纹理可以分为左端帽、可横向拉伸的中段、右端帽。原版 38px 本体的纹理边距为 42px，端帽半幅为 19 + 42 = 61px；中段只有 2px。只拉伸中段，端帽和纵向范围保持不变，窄屏也不会把圆头、细线和光的距离拉变形。

## 本体细线与聚焦状态

| 部分 | 静置 | 真实聚焦 |
| --- | --- | --- |
| 宽光池 opacity | 0.55 | 0.90 |
| 宽光池 scale | 1 | 1.10 |
| 边缘光 opacity | 0.30 | 0.82 |
| 暗色本体细线，顶部/中部/底部白色 alpha | 0.17 / 0.09 / 0.06 | 0.85 / 0.45 / 0.25 |
| 浅色本体细线 | fieldLine | ink |

这些 opacity 作用于已经带透明度的纹理，不是最终像素亮度。悬停可以略增强，但不能冒充真实焦点。浅色模式不要套用暗色白光细线。

原版使用两种不同的状态：

```js
const chromeActive = focused || query.length > 0;
const haloFocused = focused;
const shouldBreathe = focused && motionEnabled && !document.hidden;
```

输入非空但失焦时，本体细线可以保留较高对比；光池增强与呼吸仍由真实 focus 驱动。用 focus/blur 或 focusin/focusout 更新状态，避免靠固定“聚焦效果”按钮让外观与 document.activeElement 不一致。

聚焦和失焦沿 240ms cubic-bezier(0.2, 0, 0, 1) 切换。聚焦时可附加一次 900ms 边缘 bloom，前约 22% 时段升到峰值，再缓慢回落。呼吸混合 4.7s 与 7.1s 两个周期，振幅保持轻微，失焦后停止。

## 缓存与性能

以主题、灯色和本体高度为纹理缓存键；只有这些输入改变时才重画。输入内容、hover、focus 和光强变化都复用纹理。逐帧只改变 opacity / transform，避免每个按键重跑像素循环或动画大范围 blur。

本 Web 示例固定为 38px 高，因此实际缓存键只含灯色与主题。若要改变高度，需要同时更新 FIELD_HEIGHT、胶囊距离场、端帽尺寸和 CSS 几何，并把高度纳入缓存键；不能只改输入框的 CSS height。

原生实现采用 16-bit premultiplied RGBA；浏览器 Canvas ImageData 一般写入 8-bit 直通 RGBA，交由浏览器合成，不应再手工重复 premultiply。需要预览多种灯色时，可以惰性生成并缓存，避免首次挂载阻塞大量纹理绘制。

## 输入、动态与降级

- 输入框保留正常 label、光标和键盘操作；清除后焦点仍在输入框。Esc 在有文字时先清空，再按可退出焦点；不要干扰 IME composition。
- ⌘F / Ctrl+F 可作为页面搜索标本的入口，但不抢走其他正在编辑的输入框或 contenteditable 的焦点。
- 色灯切换不改变输入内容；指针点击色灯时可保留输入焦点，键盘操作仍需完整可达。
- 页面隐藏时暂停呼吸；关闭动态或开启 Reduce Motion 时移除呼吸、缩放与 bloom，保留完整的静态聚焦态。
- 不要把从 opacity:0 起步的入场动画直接 pause；降级时应直接落在可见完成态。

验证时实际对比静置/悬停/聚焦/非空失焦，确认输入框边界与文字位置没有跳动；检查明暗主题、窄屏、手动灯色和跟随环境色、无结果与清除、系统减少动态效果。对比度按合成画面判断。

## 完整示例与精度边界

公开项目的 [search-light.js](https://github.com/Yourkaikai/keyfolio-design/blob/main/docs/search-light.js) 和 [search-light.css](https://github.com/Yourkaikai/keyfolio-design/blob/main/docs/search-light.css) 展示了可运行的 Web 迁移。加载样式后挂载到空容器，并在桌面的主题、有效厂商或动态偏好改变时更新环境：

```js
import { mountSearchLight } from './search-light.js';

const search = mountSearchLight(document.querySelector('#search-light-demo'));
search.setEnvironment({
  theme: 'dark',        // 'dark' 或 'light'
  providerId: 'openai', // PROVIDERS 中的 id；null 表示桌灯
  motionEnabled: true,
});
```

手动试看灯色会保留到点击“跟随桌面”，或外部有效 providerId 改变。同一厂商的主题、动态偏好更新不清除手动灯色，也不改变输入内容。

Web 示例以 4.7s 与 7.1s 分别驱动光池和边缘透明度，未移植原生的混合呼吸、DeskTint 增益求解、特殊色相偏转与环境换色交叉淡入。纹理位深、色彩映射与原生 CALayer 合成也不同；不能把相似的 Web 光形称为 SwiftUI 像素级复刻。

原版定位符号：DeskHalo、DeskHaloBake、FieldRim、FieldRimBake、ContentView.searchField、fieldRimLine。本文关键参数提取于 2026-10-20。
