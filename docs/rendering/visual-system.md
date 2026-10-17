# 渲染与视觉系统

Three.js 0.186，WebGL2，`WebGLRenderer`。入口是 `src/render/world.ts`。

## 场景结构

```
Scene
├─ Lighting：DirectionalLight（太阳，阴影图 4096²，触屏和低档位 2048²/1024²，正交范围 ±150×±100）+ HemisphereLight + 天空球（渐变 shader，r=1500，地平线以下渐暗）+ Fog
├─ Terrain.group
│   ├─ 地面 Plane 264×144（264×144 段）：MeshStandardMaterial + onBeforeCompile（领土、云影、战线发光）
│   ├─ 棋盘裙边（沿地形边缘生成，直到 y=−6）+ 底板
│   ├─ 公路（贴合地形的长条，CanvasTexture 画虚线）
│   ├─ 4 个湖（水面带滚动法线图的涟漪 + 沙岸圆盘，岸线 alpha 渐隐）
│   ├─ 树（InstancedMesh ≤700，风摆 shader）
│   └─ 价格刻度（一个 InstancedMesh）和数字（每回合 setField 重建）
├─ Bases.group：两端村庄（实例化）、指挥部、旗杆和旗帜（顶点波动）、围栏、发光胜利线、夜间点光源
├─ ArmyRenderer.group：士兵 InstancedMesh(5000)、坦克 InstancedMesh(220)
├─ Effects.group：火焰和烟雾（billboard 四边形实例）、炮弹、冲击环、闪光灯、曳光弹、碎块、焦痕、烟花
└─ CSS2DObject：前线价格标签、储备标签、飘字（DOM，不经过后期处理）
```

## 地形着色器（`terrain.ts`）

| uniform | 作用 |
| --- | --- |
| `uFront` | 战线的 x（来自 `field.x(visualPrice)`） |
| `uAmp`、`uTime` | 战线波动幅度和时间，前线波动函数用 `FRONT_WAVE_GLSL` |
| `uBull/uBullDark/uBear/uBearDark` | 领土颜色。用噪声在深浅色之间混合，靠近战线的地方压暗，像被踩过 |
| `uLine`、`uLineGlow` | 战线发光颜色和强度（每套光照预设不同） |
| `uFlash` | 价格变动时的瞬时脉冲，颜色是刚推进的一方，由 `World.setPrice` 触发：强度按回合宽度归一化（一跳等于回合宽度 6% 即满强度，上限 1.0），同一方向 250 ms 内只触发一次，衰减速率 3.5，乘 1.2 写进 uniform |
| `uCloud` | 云影强度：用两层噪声滚动，压暗漫反射 |

发光公式：`(uLine × (0.38 + 流光脉冲 × 1.5) + uFlash × 0.5) × 战线宽度 × uLineGlow`，战线半宽 0.22 世界单位；再加上战线两侧很淡的阵营色辉光（0.035，按 `exp(-1.6|d|)` 衰减）。流光脉冲沿 z 方向移动，有两个频率。2026-10-17 之前半宽是 0.45、底亮 0.75、侧光 0.09，看起来像霓虹灯管，审查后调细调暗。

## 单位着色器（`units.ts`）

- **几何体**：用 `merge()` 拼接盒子，自带 `position`、`normal`、`color`（明暗）、`aPart` 四个属性，最后 `mergeVertices()` 做成索引几何（士兵 324 → 216 顶点）。

| aPart | 部件 | 动画 |
| --- | --- | --- |
| 0 | 身体、头、头盔、背包 | 无（整体的晃动和倾斜在 CPU 上算） |
| 1 / 2 | 左腿 / 右腿 | 绕髋部（y=0.46）前后摆动，摆幅 = 0.7 × moving，两腿相位相反 |
| 3 | 手臂和步枪 | 后坐：x −0.14 × fire；行军时轻微上下 |
| 4 | 坦克炮塔 | 后坐 x −0.08 × fire |
| 5 | 坦克炮管 | 后坐 x −0.45 × fire |

- **实例属性** `aAnim(vec4)` 的四个分量：

| 分量 | 含义 |
| --- | --- |
| x | 相位种子 |
| y | moving，0–1 |
| z | fire：开火时设为 1，士兵按 7/s、坦克按 2.5/s 衰减 |
| w | 受击闪光：单位自身颜色推向暖白（`mix(diffuse × 2.2, 暖白, 0.45) × 1.3`），按 4/s 衰减 |

- 阴影：`customDepthMaterial` 注入同样的顶点变形，所以阴影里的腿也会摆。
- CPU 每帧负责：位置朝目标移动（士兵 7/s，坦克 5/s）、朝向、行军前倾、倒地（绕 z 轴旋转）、下沉、出生时的缩放淡入、撤退时缩小消失。
- 在 `setTargets` 里给每个单位设一个 HSL 微抖动的 instanceColor，让人群看起来不是一片死色。
- **只画、只传用到的槽位**：`update()` 记录最高的在用槽位，把 `InstancedMesh.count` 设成它加一，`instanceMatrix` 和 `aAnim` 用 `addUpdateRange` 只上传这一段。容量仍是 5000/220，但平时只有两千多个槽位在用。
- 每帧还维护每队「前排且静止」的单位列表，`randomFrontSoldier()` 直接从里面抽，对射才抽得到人。
- **加新部件时**：在 `soldierGeometry()` 或 `tankGeometry()` 里用 `part(geo, 明暗, PART_ID)` 加进去。要新动画，就在 `UNIT_VERTEX_BODY` 里加分支，并把着色器版本、阴影版本和本文档的表一起更新。

## 特效池（`effects.ts`）

| 池 | 容量 | 混合方式 | 说明 |
| --- | --- | --- | --- |
| fire（billboard 四边形） | 6000 | 加法，`uIntensity` 2.6（HDR），最小 2.5 px | 爆心、火球、余烬、枪口火光、信号弹、炮弹尾迹、烟花火花 |
| smoke（billboard 四边形） | 3000 | 普通混合，带风漂移（0.6, 0, 0.25） | 爆炸烟、扬尘、前线硝烟（颜色由光照预设的 `smoke` 决定）。片元用一张 128² 的平铺 fbm 噪声贴图做烟团轮廓，用它的屏幕空间梯度（`dFdx/dFdy`）和太阳方向算明暗，环境色取半球光 |
| 炮弹 | 40 | Basic，颜色 ×5 | 抛物线，弧高 = min(18, 2 + 距离 × 0.18)，飞行时间 = 0.5 + 距离 / 45；尾迹按固定时间间隔（1/60 s）在上一帧和这一帧位置之间插值发射，不随帧率变密变疏 |
| 冲击环 | 16 | 加法，径向渐变贴图的平面 | 内柔外锐，缓出放大并按 (1−k)^1.5 淡出 |
| 闪光点光源 | 4 | — | 0.3 s 平方衰减；不亮时 `visible = false`，不进光照计算 |
| 曳光弹 | 240 | 加法 InstancedMesh，0.1 粗，颜色 ×7 | 速度 35 单位/s，尾长最多 2.4，命中时出火星 |
| 碎块 | 400 | Standard InstancedMesh | 带重力、能落地反弹，2.2–3.7s 后缩小消失 |
| 焦痕 | 40 | Basic，带 polygonOffset | 每次放置时按 `groundHeight` 重建 6×6 网格贴合地形，25–55s 淡出；池满时复用最旧的 |
| 烟花 | 24 | 走 fire/smoke 池 | `firework(p, color)`：一颗带尾迹的火箭升到 13–20 单位高，爆开 46–62 颗阵营色火花（重力 4.5）加一小团烟和一盏弱闪光。胜利庆祝在**胜方**基地和前线上空放 11 发 |

粒子是**紧凑数组**：存活的排在前面，死亡的和最后一个存活粒子交换位置；每帧只上传、只绘制 `[0, live)` 这一段（`InstancedBufferGeometry.instanceCount` + `addUpdateRange`）。池满时轮转覆盖存活粒子。2026-10-17 之前是点精灵加环形缓冲：9000 个粒子全部绘制和上传，其中约 98% 已经死掉，而且 GPU 把点精灵限制在 511 px（手机更小），大烟雾会被裁成方块。四边形的世界尺寸 = `size × 0.46`，和原来点精灵的像素大小相同；顶点着色器按投影后的像素大小保证最小尺寸（远处的信号弹不再消失）。

## 后期（`post.ts`，ADR 0009）

```
场景 → HalfFloat 渲染目标（MSAA 4×/2×/0） → 泛光链（亮度提取 + 5 级模糊，起始分辨率 = CSS 尺寸的一半）
     → Finish 全屏 pass（叠加泛光、移轴、饱和度、色温、暗角、ACES 色调映射、sRGB）直接画到画布
```

- 每帧只有两个全分辨率 pass 和一次 MSAA 解析。2026-10-17 之前用的是 EffectComposer 的 `RenderPass → UnrealBloomPass → ShaderPass → OutputPass`：四个全分辨率 pass、三次解析，而且 composer 把 4× MSAA 的目标 clone 成两个，第二个只承接一个全屏四边形。
- `BloomTexture` 是 `UnrealBloomPass` 的子类，只跳过它最后一步「加法混合回场景目标」，泛光留在它自己的小目标里，由 Finish 采样叠加。
- `Finish`：
  - **移轴**：屏幕中带 ±0.16 范围清晰，往上下逐渐模糊，用 12 个 Poisson 采样点。模糊半径在电影模式下是 3.2 × 高度/1000，手动模式下是 1.4，两者之间平滑过渡。低档位关掉（`tiltEnabled`），pass 就只剩一次采样。
  - **调色**：饱和度 1.1，乘上每个预设的色温（warm）。
  - **暗角**。
  - **色调映射和色彩空间**：shader 末尾 `#include <tonemapping_fragment>` 和 `#include <colorspace_fragment>`；three 对画到画布的非 Raw ShaderMaterial 自动定义这两段。
- 开启后期时会关掉 renderer 自己的 antialias，改用渲染目标的 MSAA（`setSamples()` 可以在运行时换）。
- 关闭方式：URL `?post=0`，或 `?q=low`（同时关阴影、像素比降到 1）。
- **陷阱**：
  - 天空和粒子这些自定义 `ShaderMaterial` 的片元末尾也带上面两个 include：画进 HDR 目标时它们是空操作，画到画布（后期关闭）时做色调映射和 sRGB，两条路径颜色一致。以前关掉后期天空发黑、烟雾全黑，就是缺这两行。新写 ShaderMaterial 时照做。
  - 东西要发光，就把它的颜色或强度提到阈值以上，见 AGENTS.md 第 5 条。

## 光照预设（`lighting.ts → PRESETS`）

| 预设 | 太阳 | 曝光 | 战线发光 | Bloom 强度 / 阈值 | 色温 | 暗角 | 硝烟颜色 | 云影 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `golden` | #ffbf80 ×3.2，低角度 | 1.0 | 1.0 | 0.55 / 1.3 | 1.05, 1.0, 0.92 | 0.34 | #9a8270 | 0.22 |
| `day` | #fff6e8 ×3.4，高角度 | 0.95 | 0.85 | 0.4 / 1.7 | 1, 1, 1 | 0.26 | #a49c92 | 0.25 |
| `night` | #a9c1ff ×1.6（月光） | 1.35 | 0.9 | 0.65 / 1.3 | 0.92, 0.98, 1.1 | 0.42 | #3c4250 | 0.1 |

- `auto` 模式：7–16 点用白天，5–7 点和 16–19 点用黄昏，其余用夜晚。
- 夜间基地点光源强度为 60。夜晚的泛光阈值 2026-10-17 从 1.0 提到 1.3，否则单位的阵营色也会泛光。
- 阴影：`renderer.shadowMap.autoUpdate = false`，`World.frame` 每隔 `shadowInterval` 帧置一次 `needsUpdate`（桌面每帧，触屏隔帧，低档位每 3–4 帧）；切换预设时也会刷新。`Lighting.setShadows(size)` 在运行时换阴影图大小（置空 `shadow.map` 让 three 重建）或关掉阴影。类型是 `PCFShadowMap`（r186 已删除 `PCFSoftShadowMap`）。

## 镜头（`camera.ts`）

- **手动模式**：OrbitControls，阻尼 0.08，最大俯仰角 1.38，距离 10–340。
  - WASD / 方向键：在水平面上平移，速度和镜头距离成正比。
  - Q / E：绕目标环绕。
  - 鼠标按下、滚轮、WASD 都会退出电影模式。C 键切换电影模式，F 键聚焦前线。
- **电影模式**：按 `overview → frontline → charge → orbit → frontline → base` 循环，每个镜头 8–12 秒。
  - 镜头内的运动用 smoothstep 缓动，位置用指数平滑追随（镜头刚开始时慢一些）。
  - `charge` 镜头会根据价格动量选择从哪一方身后拍。
  - `base` 镜头对准受威胁的那个基地。
  - `focusEvent(p)` 插入 4.5 秒的事件特写（大事件可以打断其他特写）。
  - 叠加轻微的手持漂移（对注视点做低频正弦偏移）。
- **震动**：`shake(amount)`，上限 2.2，按 5/s 指数衰减。偏移是 9/11/13 Hz 三个正弦的阻尼振荡（以前是每帧独立随机数，看起来像白噪声）。
  - 偏移量会在下一帧先减掉，所以不会累积进 OrbitControls 的状态。
  - 触发条件：镜头距着弹点 110 以内，强度 = size × 0.32 × (1 − 距离/110)。
- **竖屏**：`World.resize` 按宽高比放大垂直视角（`fov = 2·atan(tan(21°) × (1/aspect)^0.5)`，上限 1.6 倍），`CameraRig.setAspect` 让脚本镜头按 `(1/aspect)^0.4`（上限 1.5）拉远。手机竖屏现在能看到大半个战场，以前只有中段约 20°。

## 画质分档与自适应（`quality.ts`）

| 档位 | 像素比上限 | 场景 MSAA | 阴影图 / 更新间隔 | 泛光 | 移轴 |
| --- | --- | --- | --- | --- | --- |
| 5（桌面默认） | 2（触屏 1.5） | 4×（像素比 ≥ 2 或触屏时 2×） | 4096² / 每帧（触屏 2048² / 隔帧） | 开 | 开 |
| 4（触屏默认） | 1.5 | 2× | 2048² / 隔帧 | 开 | 开 |
| 3 | 1.25 | 2× | 2048² / 每 3 帧 | 开 | 开 |
| 2 | 1 | 无 | 1024² / 每 3 帧 | 开 | 关 |
| 1 | 1 | 无 | 关 | 关 | 关（只剩色调映射） |
| `q=low` | 1 | 无（用画布自带的 antialias） | 关 | 无后期 | 无后期 |

- 触屏判定：`(pointer: coarse)` 或多点触控。
- `QualityGovernor`：每 90 帧看一次 rAF 间隔的中位数，超过 20 ms 降一档，连续 10 个窗口不超过 17.5 ms 升一档（不超过起始档），每次变动后冷却 4 s；某一档降过两次就不再往回升，避免在临界设备上来回跳。标签页不可见时不采样。
- URL：没有 `q` 就自适应；`q=1`…`q=5` 或 `q=high` 固定档位（验证脚本和基准测试用）；`q=low` 固定最省模式。当前档位在 `__bb.stats.quality`。
- `World.applyQuality()` 在运行时换像素比（重新 `resize`）、MSAA（重建场景目标）、阴影（`Lighting.setShadows`）、泛光和移轴开关。
- 纯逻辑，有单测 `tests/quality.test.ts`。

## 性能

- **基准**（2026-10-17 改造后，Apple M4、Chrome 无头模式，冻结帧成本 = CPU + GPU 串行等待，模拟行情预热 150 s 后 2,000 多个士兵槽位）：数字见 [session-log](../handoff/session-log.md) 会话 23；改造前桌面 1600×900@1 是 9.8 ms、手机视口 9.1 ms、平板 1024×1366@2 是 27.4 ms（40 fps，GPU 进程显存 1.35 GB），其中后期链路分别占 57% / 58% / 76%。实时行情下约 2,400 名士兵加 96 辆坦克，桌面开阴影和后期跑满 60 FPS。
- **主要开销**（改造后）：全分辨率的两个 pass 和 MSAA 解析（像素比 2 时最贵）、阴影 pass（5000 槽位的士兵画两遍）、地面 shader 的 5 次噪声（≤ 1.5 ms，不值得简化）。
- **已经做掉的**：粒子只画、只传存活区间；单位按高水位绘制并索引化；阴影隔帧；合成器少两个全分辨率 pass 和一个 MSAA 目标；泛光链起始分辨率减半；储备标签尺寸只在文字变化时量一次；`groundHeight` 湖泊平方距离早退；飘字 DOM 节点对象池；去掉 `preserveDrawingBuffer`；爆炸不再每个粒子分配对象；炮弹尾迹按时间发射。
- **降级手段**：自适应档位（上面）；`?q=low`、`?post=0`；`DEFAULT_LAYOUT` 的各项上限；士兵总量目标（深度 / 1100）。
- **还没做**（见 backlog）：远处单位 LOD（真机测出顶点瓶颈再做）、移动端真机实测。

## 新加一种视觉效果的套路

1. 能放进现有池的就放：粒子发射走 `Effects.fire` 或 `Effects.smoke`，一次性网格走 pool。不要每次 `new Mesh`。
2. 要发光就用 HDR 颜色。用三套光照预设分别截图检查，夜晚最容易过曝。
3. 只用传给 `frame(dt)` 的 dt 驱动动画，不要读 `Date.now()`；每帧发射的东西（尾迹）要按时间累积，不要每帧发一个。
3b. 新的 `ShaderMaterial` 片元末尾加 `#include <tonemapping_fragment>` 和 `#include <colorspace_fragment>`，否则后期关闭时颜色不对。
4. 跑 `pnpm build && pnpm verify:screens`，看 FPS 和截图。
