// 智能小猫脚本 (Smart Oneko.js)
// 这个脚本创建了多只可以互动的像素小猫，它们可以追踪小球、观看游戏、互相玩耍
// 基于原始 oneko.js 项目，添加了更多智能行为和互动功能

(function () {
  // ============================================================================
  // 1. 基础配置和全局变量
  // ============================================================================

  // 检查用户是否设置了"减少动效"的无障碍选项，如果是则不显示小猫
  const isReducedMotion = window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;
  if (isReducedMotion) return; // 如果用户偏好减少动效，直接退出

  // 基础配置常量
  const baseSpeed = 10; // 小猫的基础移动速度（像素/帧）

  // 小猫缩放配置（1.0 = 原始大小32x32像素）
  const CAT_SCALE = window.innerWidth < 768 ? 1.0 : 1.5; // 电脑版放大1.5倍，手机版保持原始大小
  const CAT_SIZE = 32 * CAT_SCALE; // 小猫实际显示大小
  const CAT_HALF = CAT_SIZE / 2; // 小猫半径，用于定位

  // 小猫皮肤配置
  const catSkins = [
    "/blog/images/oneko.gif",   // 默认皮肤
    "/blog/images/30neko.png",    // 30neko
    "/blog/images/hellokitty.png"   // hellokitty
  ];

  // 全局状态变量
  let cats = []; // 存储所有小猫对象的数组
  let pixelBalls = []; // 存储像素小球对象的数组
  let switchEl = null; // Switch游戏机的DOM元素引用
  let isSwitchActive = false; // Switch是否处于激活（游戏中）状态
  let mousePos = { x: -1, y: -1 }; // 鼠标当前位置坐标
  let lastInteractionTime = 0; // 上次小猫社交互动的时间戳
  const SOCIAL_COOLDOWN = 20000; // 社交互动的冷却时间（20秒）
  let frameCount = 0; // 动画帧计数器，用于控制动画播放
  let lastFrameTimestamp; // 上一帧的时间戳，用于控制帧率
  let currentMouseFollower = null; // 当前正在追逐鼠标的小猫
  let lastMouseChaseTime = 0; // 上次开始追逐鼠标的时间戳
  const MOUSE_CHASE_COOLDOWN = 5000; // 鼠标追逐的冷却时间（5秒）

  // ============================================================================
  // 2. 精灵图动画帧定义
  // ============================================================================

  // 定义小猫的所有动画状态及其对应的精灵图坐标
  // 每个状态包含一个或多个帧，坐标为[x, y]，表示在精灵图中的位置
  const spriteSets = {
    idle: [[-3, -3]], // 静止状态：坐着不动
    alert: [[-7, -3]], // 警觉状态：注意到某些东西
    scratchSelf: [[-5, 0], [-6, 0], [-7, 0]], // 舔毛/挠自己：清洁动作
    scratchWallN: [[0, 0], [0, -1]], // 挠北侧墙壁
    scratchWallS: [[-7, -1], [-6, -2]], // 挠南侧墙壁
    scratchWallE: [[-2, -2], [-2, -3]], // 挠东侧墙壁
    scratchWallW: [[-4, 0], [-4, -1]], // 挠西侧墙壁
    tired: [[-3, -2]], // 疲惫状态：累了
    sleeping: [[-2, 0], [-2, -1]], // 睡眠状态：睡觉动画
    // 移动状态：8个方向的移动动画（每个方向2帧用于行走动画）
    N: [[-1, -2], [-1, -3]], // 向北移动
    NE: [[0, -2], [0, -3]], // 向东北移动
    E: [[-3, 0], [-3, -1]], // 向东移动
    SE: [[-5, -1], [-5, -2]], // 向东南移动
    S: [[-6, -3], [-7, -2]], // 向南移动
    SW: [[-5, -3], [-6, -1]], // 向西南移动
    W: [[-4, -2], [-4, -3]], // 向西移动
    NW: [[-1, 0], [-1, -1]], // 向西北移动
  };

  // ============================================================================
  // 3. 小猫类定义 (Cat Class)
  // ============================================================================

  class Cat {
    // 构造函数：创建一只新的小猫
    constructor(id, startX, startY, skinUrl) {
      // 基础属性
      this.id = id; // 小猫的唯一标识符
      this.posX = startX; // 当前X坐标位置
      this.posY = startY; // 当前Y坐标位置
      this.targetX = startX; // 目标X坐标位置（小猫想要移动到的地方）
      this.targetY = startY; // 目标Y坐标位置
      this.speed = baseSpeed; // 当前移动速度
      this.skinUrl = skinUrl; // 小猫皮肤图片路径

      // 状态系统：定义小猫可能的行为状态
      // 'roam': 漫游状态, 'idle': 发呆, 'meeting': 与其他猫约会, 'interacting': 互动中
      // 'watch': 观看Switch, 'zoomies': 快速跑动,
      // 'chasing': 追踪小球, 'following_mouse': 跟随鼠标
      this.state = 'roam';

      // 计时器和状态变量
      this.waitTimer = Math.random() * 20; // 发呆等待时间（随机化避免所有猫同时行动）
      this.chasingTarget = null; // 正在追踪的目标（像素球）
      this.mouseFollowTimer = 0; // 跟随鼠标的剩余时间
      this.idleTime = 0; // 空闲时间计数器，用于触发随机动画

      // 动画相关属性
      this.currentAnimation = null; // 当前播放的动画名称
      this.animFrame = 0; // 当前动画帧索引

      // 社交互动属性
      this.interactionPartner = null; // 互动伙伴（另一只猫）
      this.interactionTimer = 0; // 互动持续时间
      // 记录看 switch 时的座位
      this.watchOffset = null; 

      // ========================================================================
      // 创建DOM元素
      // ========================================================================

      // 创建小猫的主体DOM元素
      this.el = document.createElement("div");
      // 在 Cat 类的 constructor 中
      this.el = document.createElement("div");
      this.el.style.cssText = `
        width: 32px; height: 32px; position: fixed;
        z-index: 900; pointer-events: auto;
        image-rendering: pixelated;
        background-image: url('${this.skinUrl}');
        transition: transform 0.1s linear; 
        left: 0; top: 0;
        transform-origin: center center;
        transform: translate3d(${this.posX - CAT_HALF}px, ${this.posY - CAT_HALF}px, 0) scale(${CAT_SCALE});
        
        cursor: pointer;
        will-change: transform;
      `;

    //   this.el.style.cssText = `
    //     width: 32px; height: 32px; position: fixed;
    //     z-index: 900; pointer-events: auto;
    //     image-rendering: pixelated;
    //     background-image: url('${this.skinUrl}');
    //     transform: translate3d(0,0,0) scale(${CAT_SCALE});
    //     transform-origin: center center;
    //     transition: top 0.1s linear, left 0.1s linear;
    //     cursor: pointer;
    //   `;

      // 创建思考泡泡DOM元素（显示表情符号）
      this.bubble = document.createElement("div");
      this.bubble.style.cssText = `
        position: absolute; top: -25px; left: -10px; width: 50px;
        text-align: center; font-size: 16px; opacity: 0; transition: opacity 0.2s;
        text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff;
        pointer-events: none;
      `;
      this.el.appendChild(this.bubble); // 将泡泡添加到小猫元素中
      document.body.appendChild(this.el); // 将小猫添加到页面中

      // 鼠标悬停事件：显示爱心气泡
      this.el.addEventListener('mouseenter', () => {
        // 只有在空闲状态时才显示爱心（不在跑动、社交或睡觉）
        const isIdle = this.state === 'idle' || this.state === 'roam';
        const isNotBusy = !this.currentAnimation || this.currentAnimation === 'idle';
        const isStationary = Math.sqrt((this.targetX - this.posX)**2 + (this.targetY - this.posY)**2) < 20;

        if (isIdle && isNotBusy && isStationary) {
          this.showThought("❤️", 1500);
        }
      });

      // 初始化位置和目标
      this.setInitialTarget(); // 设置初始随机目标位置
      this.updatePosition(); // 更新DOM位置
    }

    // 开始跟随鼠标的方法
    startFollowingMouse() {
      // 只有在非互动状态下，且没有其他猫在追逐鼠标时才能开始
      if (this.state !== 'interacting' && this.state !== 'meeting' && this.state !== 'watch' && !currentMouseFollower) {
        this.state = 'following_mouse'; // 切换到跟随鼠标状态
        this.mouseFollowTimer = 100 + Math.random() * 100; // 随机跟随时间（2-4秒）
        this.speed = baseSpeed * 1.2; // 稍微提高移动速度
        this.showThought("👀"); // 显示注视表情
        this.waitTimer = 0; // 清除等待时间
        this.currentAnimation = null; // 停止当前动画
        this.chasingTarget = null; // 清除追踪目标
        currentMouseFollower = this; // 设置当前追逐者
        lastMouseChaseTime = Date.now(); // 记录开始时间
      }
    }

    // 设置初始随机目标位置
    setInitialTarget() {
      const margin = 100; // 边界距离，避免小猫出现在屏幕边缘
      this.targetX = margin + Math.random() * (window.innerWidth - margin * 2);
      this.targetY = margin + Math.random() * (window.innerHeight - margin * 2);
    }

    // 更新小猫在页面上的位置
    updatePosition() {
      // 使用CAT_HALF使小猫中心对齐到坐标点
    //   this.el.style.left = `${this.posX - CAT_HALF}px`;
    //   this.el.style.top = `${this.posY - CAT_HALF}px`;
      this.el.style.transform = `translate3d(${this.posX - CAT_HALF}px, ${this.posY - CAT_HALF}px, 0) scale(${CAT_SCALE})`;
    }

    // 设置精灵图动画帧
    setSprite(name, frameIdx) {
      const frames = spriteSets[name]; // 获取动画帧数组
      if (!frames) return; // 如果动画不存在，退出

      const sprite = frames[frameIdx % frames.length]; // 循环播放动画帧
      // 设置背景位置来显示对应的精灵图片段（原始32x32切图）
      this.el.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
    }

    // 显示思考泡泡
    showThought(emoji, duration = 2000) {
      this.bubble.innerText = emoji; // 设置表情符号
      this.bubble.style.opacity = 1; // 显示泡泡
      // 在指定时间后自动隐藏泡泡
      setTimeout(() => { this.bubble.style.opacity = 0; }, duration);
    }
  }

  // ============================================================================
  // 4. 像素小球类定义 (PixelBall Class)
  // ============================================================================

  class PixelBall {
    // 构造函数：在指定位置创建一个像素小球
    constructor(x, y) {
      // 位置和物理属性
      this.posX = x; // 当前X坐标
      this.posY = y; // 当前Y坐标
      this.velocityX = (Math.random() - 0.5) * 6; // 随机水平速度
      this.velocityY = (Math.random() - 0.5) * 6; // 随机垂直速度
      this.friction = 0.96; // 摩擦力系数（减缓速度）

      // 生命周期属性
      this.life = 400; // 当前生命值
      this.maxLife = 400; // 最大生命值
      this.claimed = false; // 是否被小猫抓到
      this.claimedBy = null; // 被哪只小猫抓到

      // 获取小球颜色（基于页面背景色）
      const bgColor = this.getBackgroundColor();
      this.color = this.getContrastColor(bgColor);

      // 创建小球的DOM元素
      this.el = document.createElement("div");
      this.el.style.cssText = `
        width: 10px; height: 10px; position: fixed;
        z-index: 850; pointer-events: none;
        background-color: ${this.color};
        border-radius: 50%;
        transform: translate3d(0,0,0);
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      document.body.appendChild(this.el); // 添加到页面
      this.updatePosition(); // 更新位置
    }

    // 检测页面背景颜色
    getBackgroundColor() {
      const body = document.body;
      const style = window.getComputedStyle(body);
      const bgColor = style.backgroundColor;
      // 如果背景色存在且不透明，返回背景色，否则返回白色
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        return bgColor;
      }
      return 'rgb(255, 255, 255)'; // 默认白色背景
    }

    // 根据背景色获取对比色
    getContrastColor(bgColor) {
      if (bgColor.includes('255, 255, 255') || bgColor.includes('white')) {
        // 白色背景使用深色小球
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7'];
        return colors[Math.floor(Math.random() * colors.length)];
      } else {
        // 深色背景使用亮色小球
        const colors = ['#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'];
        return colors[Math.floor(Math.random() * colors.length)];
      }
    }

    // 更新小球位置
    updatePosition() {
      this.el.style.left = `${this.posX - 5}px`; // 中心对齐
      this.el.style.top = `${this.posY - 5}px`;
      this.el.style.opacity = this.life / this.maxLife; // 透明度随生命值变化
    }

    // 更新小球物理状态
    update() {
      // 俯视角物理：在2D平面上滑动，有摩擦力
      this.posX += this.velocityX; // 应用水平速度
      this.posY += this.velocityY; // 应用垂直速度

      // 应用摩擦力（逐渐减慢）
      this.velocityX *= this.friction;
      this.velocityY *= this.friction;

      // 边界反弹（俯视角下的墙壁）
      const margin = 10; // 边界距离
      if (this.posX <= margin) {
        this.posX = margin;
        this.velocityX = Math.abs(this.velocityX) * 0.8; // 反弹并减少速度
      }
      if (this.posX >= window.innerWidth - margin) {
        this.posX = window.innerWidth - margin;
        this.velocityX = -Math.abs(this.velocityX) * 0.8;
      }
      if (this.posY <= margin) {
        this.posY = margin;
        this.velocityY = Math.abs(this.velocityY) * 0.8;
      }
      if (this.posY >= window.innerHeight - margin) {
        this.posY = window.innerHeight - margin;
        this.velocityY = -Math.abs(this.velocityY) * 0.8;
      }

      // 检查是否被小猫抓到（可能导致立即销毁）
      this.checkCatCollision();

      // 如果球被销毁了，直接返回false
      if (this.claimed) return false;

      // 生命值递减
      this.life--;
      this.updatePosition();

      // 速度太小时停止移动
      if (Math.abs(this.velocityX) < 0.1 && Math.abs(this.velocityY) < 0.1) {
        this.velocityX = 0;
        this.velocityY = 0;
      }

      // 生命结束时销毁小球
      if (this.life <= 0) {
        this.destroy();
        return false;
      }
      return true; // 继续存在
    }

    // 检查小猫碰撞
    checkCatCollision() {
      if (this.claimed) return; // 如果已经被抓到，不再检查

      // 遍历所有正在追踪这个球的小猫
      for (let cat of cats) {
        if (cat.state === 'chasing' && cat.chasingTarget === this) {
          // 计算小猫到球的距离
          const dist = Math.sqrt((cat.posX - this.posX)**2 + (cat.posY - this.posY)**2);
          if (dist < 25) { // 如果距离足够近
            // 小猫抓到球了！
            this.claimed = true;
            this.claimedBy = cat;

            // 胜利者显示胜利气泡
            cat.showThought("🎉", 3000);
            cat.state = 'roam'; // 切换回漫游状态
            cat.speed = baseSpeed; // 恢复正常速度
            cat.chasingTarget = null; // 清除追踪目标
            cat.waitTimer = 20; // 短暂休息
            // 胜利者停在原地
            cat.targetX = cat.posX;
            cat.targetY = cat.posY;

            // 其他正在追这个球的猫显示失败气泡
            cats.forEach(otherCat => {
              if (otherCat !== cat && otherCat.chasingTarget === this) {
                otherCat.showThought("😿", 2000);
                otherCat.state = 'roam';
                otherCat.speed = baseSpeed;
                otherCat.chasingTarget = null;
                otherCat.waitTimer = 15;
                // 重置目标位置为当前位置，停止移动
                otherCat.targetX = otherCat.posX;
                otherCat.targetY = otherCat.posY;
              }
            });

            // 立即销毁球
            this.destroy();
            break;
          }
        }
      }
    }

    // 销毁小球
    destroy() {
      // 从DOM中移除元素
      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
      // 清理所有对这个球的追踪引用
      cats.forEach(cat => {
        if (cat.chasingTarget === this) {
          cat.chasingTarget = null;
          cat.state = 'roam';
          cat.waitTimer = 0;
        }
      });
    }
  }

  // ============================================================================
  // 5. 辅助函数
  // ============================================================================

  // 检查是否为移动设备
  function isMobile() {
    return window.innerWidth < 768;
  }

  // 获取内容区域的限制范围（用于桌面端小猫漫游）
  function getRestrictedZone() {
    // 尝试找到内容容器
    const el = document.querySelector('.container') || document.querySelector('main');
    if (el) return el.getBoundingClientRect();
    // 如果没有找到，使用屏幕宽度的15%-85%区域
    const w = window.innerWidth;
    return { left: w * 0.15, right: w * 0.85 };
  }

  // 数值限制函数：确保值在指定范围内
  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  // ============================================================================
  // 6. 工具函数
  // ============================================================================

  // ============================================================================
  // 7. 初始化函数
  // ============================================================================

  function init() {
    // 根据设备类型创建小猫
    if (isMobile()) {
      // 移动端：创建一只猫，使用30neko皮肤
      const x = 50 + Math.random() * (window.innerWidth - 100);
      const y = 50 + Math.random() * (window.innerHeight - 100);
      cats.push(new Cat(0, x, y, catSkins[1])); // 30neko皮肤
    } else {
      // 桌面端：创建三只猫，每只使用不同皮肤
      for (let i = 0; i < 3; i++) {
        const x = 50 + Math.random() * (window.innerWidth - 100);
        const y = 50 + Math.random() * (window.innerHeight - 100);
        cats.push(new Cat(i, x, y, catSkins[i])); // 按顺序分配皮肤
      }
    }

    // ========================================================================
    // 事件监听器设置
    // ========================================================================

    // 监听鼠标移动，更新鼠标位置
    document.addEventListener("mousemove", (e) => {
      mousePos.x = e.clientX;
      mousePos.y = e.clientY;
    });

    // 双击页面事件：生成像素球
    document.addEventListener("dblclick", (e) => {
      e.preventDefault(); // 阻止默认双击行为

      // 限制同时最多只有一个小球
      if (pixelBalls.length > 0) return;

      // 创建新的像素球
      const ball = new PixelBall(e.clientX, e.clientY);
      pixelBalls.push(ball);

      // 让所有空闲的小猫追逐这个球（无距离限制）
      cats.forEach(cat => {
        // 只有在空闲状态且Switch未激活时才追球
        if (cat.state !== 'interacting' &&
            cat.state !== 'meeting' &&
            cat.state !== 'watch' &&
            !cat.currentAnimation && // 没有在播放动画（如睡觉）
            !isSwitchActive) {
          cat.state = 'chasing'; // 切换到追踪状态
          cat.chasingTarget = ball; // 设置追踪目标
          cat.speed = baseSpeed * (1.5 + Math.random() * 0.5); // 随机速度差异
          cat.showThought("⚡"); // 显示兴奋表情
          cat.waitTimer = 0; // 清除等待时间
          cat.currentAnimation = null; // 停止当前动画
        }
      });
    });

    // 监听 Switch 游戏开始事件
    window.addEventListener('switch-game-start', () => {
      console.log("Cat: Game Started!");
      isSwitchActive = true; // 标记Switch为激活状态
      switchEl = document.querySelector('.switch-console'); // 获取Switch元素

      // 让所有小猫跑向Switch附近观看
      cats.forEach(c => {
        // 跳过正在互动的猫
        if (c.state !== 'interacting' && c.state !== 'meeting') {
           c.state = 'watch'; // 设置为观看状态
           c.showThought("🎮"); // 显示游戏手柄表情
           c.waitTimer = 0; // 清除等待时间
           c.currentAnimation = null; // 停止当前动画
           c.chasingTarget = null; // 停止追球
           c.mouseFollowTimer = 0; // 停止跟随鼠标
           c.speed = baseSpeed * 1.5; // 提高移动速度

           // 立即设置目标位置，让小猫跑向Switch
           handleSwitchMode(c);
        }
      });
    });

    // 监听 Switch 游戏结束事件
    window.addEventListener('switch-game-end', () => {
      console.log("Cat: Game Ended - Scattering...");
      isSwitchActive = false; // 标记Switch为非激活状态
      switchEl = null; // 清除Switch元素引用

      // 让所有小猫散开
      cats.forEach(c => {
        c.watchOffset = null;
        // 跳过正在互动的猫
        if (c.state !== 'interacting' && c.state !== 'meeting') {
          c.state = 'roam'; // 切换到漫游状态
          c.waitTimer = 0; // 立即行动
          c.showThought("💨"); // 显示离开表情

          // 随机选择一个角落作为目标
          const corners = [
            {x: 50, y: 50}, // 左上角
            {x: window.innerWidth - 50, y: 50}, // 右上角
            {x: 50, y: window.innerHeight - 50}, // 左下角
            {x: window.innerWidth - 50, y: window.innerHeight - 50} // 右下角
          ];
          const dest = corners[Math.floor(Math.random() * corners.length)];
          // 添加随机偏移避免重叠
          c.targetX = dest.x + (Math.random() * 100 - 50);
          c.targetY = dest.y + (Math.random() * 100 - 50);
          c.speed = baseSpeed;
        }
      });
    });

    // 启动主游戏循环
    window.requestAnimationFrame(gameLoop);
  }

  // ============================================================================
  // 8. 主游戏循环
  // ============================================================================

  function gameLoop(timestamp) {
    // 初始化时间戳
    if (!lastFrameTimestamp) lastFrameTimestamp = timestamp;

    // 控制帧率：每100毫秒更新一次（10 FPS）
    if (timestamp - lastFrameTimestamp > 100) {
      lastFrameTimestamp = timestamp;
      frameCount++; // 增加帧计数

      // 更新所有像素球
      for (let i = pixelBalls.length - 1; i >= 0; i--) {
        if (!pixelBalls[i].update()) {
          pixelBalls.splice(i, 1); // 移除已消失的球
        }
      }

      // 尝试触发全局事件（小猫社交）
      tryTriggerGlobalEvent(timestamp);

      // 更新所有小猫的逻辑
      cats.forEach(cat => updateCatLogic(cat));

      // 统一处理碰撞检测（在所有猫移动后）
      handleCatCollisions();
    }

    // 请求下一帧
    window.requestAnimationFrame(gameLoop);
  }

  // ============================================================================
  // 9. 全局事件系统（小猫社交）
  // ============================================================================

  function tryTriggerGlobalEvent(now) {
    // 移动端或猫数量不足时不触发社交
    if (isMobile() || cats.length < 2) return;
    // 冷却时间内不触发
    if (now - lastInteractionTime < SOCIAL_COOLDOWN) return;
    // Switch激活时不触发社交（专注观看游戏）
    if (isSwitchActive) return;

    // 5%的概率触发社交事件
    if (Math.random() < 0.005) {
      // 找到空闲的猫
      const freeCats = cats.filter(c => ['roam', 'idle'].includes(c.state));
      if (freeCats.length >= 2) {
        // 随机选择两只猫进行社交
        const c1 = freeCats[Math.floor(Math.random() * freeCats.length)];
        let c2 = freeCats[Math.floor(Math.random() * freeCats.length)];
        while(c1 === c2) c2 = freeCats[Math.floor(Math.random() * freeCats.length)];
        initiateRendezvous(c1, c2, now); // 开始约会
      }
    }
  }

  // 开始两只猫的约会
  function initiateRendezvous(c1, c2, now) {
    lastInteractionTime = now; // 记录互动时间

    // 计算两猫中间位置作为约会地点
    const midX = (c1.posX + c2.posX) / 2;
    const midY = (c1.posY + c2.posY) / 2;

    // 清除等待时间，设置目标位置
    c1.waitTimer = 0; c2.waitTimer = 0;
    c1.targetX = midX - 12; c1.targetY = midY; // 稍微分开站立
    c2.targetX = midX + 12; c2.targetY = midY;

    // 设置约会状态和表情
    c1.state = 'meeting'; c1.showThought("🐱"); c1.interactionPartner = c2;
    c2.state = 'meeting'; c2.showThought("🐱"); c2.interactionPartner = c1;

    // 提高移动速度快速到达约会地点
    c1.speed = baseSpeed * 1.5; c2.speed = baseSpeed * 1.5;
  }

  // ============================================================================
  // 10. 小猫个体核心逻辑
  // ============================================================================

  function updateCatLogic(cat) {
    // ========================================================================
    // A. 跟随鼠标状态
    // ========================================================================
    if (cat.state === 'following_mouse') {
      cat.mouseFollowTimer--; // 减少跟随时间

      // 计算到鼠标的距离
      const distToMouse = Math.sqrt((mousePos.x - cat.posX)**2 + (mousePos.y - cat.posY)**2);

      // 如果接近鼠标（类似追逐球的逻辑）
      if (distToMouse < 32) {
        // 抓到鼠标了！显示满足表情并停止追逐
        cat.showThought("😸", 2000);
        cat.state = 'roam';
        cat.speed = baseSpeed;
        cat.mouseFollowTimer = 0;
        cat.currentAnimation = 'scratchSelf'; // 舔毛动画
        cat.animFrame = 0;
        cat.waitTimer = 30; // 在原地休息一会儿
        if (currentMouseFollower === cat) currentMouseFollower = null; // 清除追逐者
        return;
      }

      // 跟随时间结束或鼠标离开屏幕
      if (cat.mouseFollowTimer <= 0 || mousePos.x < 0) {
        cat.state = 'roam';
        cat.speed = baseSpeed;
        cat.waitTimer = 20;
        cat.showThought("🤔");
        if (currentMouseFollower === cat) currentMouseFollower = null; // 清除追逐者
        return;
      }

      // 设置鼠标为目标位置
      cat.targetX = mousePos.x;
      cat.targetY = mousePos.y;
    }

    // ========================================================================
    // B. 追踪小球状态
    // ========================================================================
    if (cat.state === 'chasing') {
      // 检查目标是否还存在或已被其他猫抓到
      if (!cat.chasingTarget || cat.chasingTarget.claimed || pixelBalls.indexOf(cat.chasingTarget) === -1) {
        // 目标消失或被抓到，停止追踪
        if (cat.chasingTarget && cat.chasingTarget.claimed && cat.chasingTarget.claimedBy !== cat) {
          cat.showThought("😿", 1500); // 别的猫抢先了
        }
        cat.chasingTarget = null;
        cat.state = 'roam';
        cat.speed = baseSpeed;
        cat.waitTimer = 10; // 短暂休息
        // 重置目标位置为当前位置，立即停止移动
        cat.targetX = cat.posX;
        cat.targetY = cat.posY;
        return;
      }

      // 设置球的位置为目标，但根据猫的ID添加偏移避免重叠
      const target = cat.chasingTarget;
      const angleOffset = (cat.id * Math.PI * 2 / 3); // 根据ID分散角度
      const offsetDist = 15; // 偏移距离
      cat.targetX = target.posX + Math.cos(angleOffset) * offsetDist;
      cat.targetY = target.posY + Math.sin(angleOffset) * offsetDist;
    }

    // ========================================================================
    // C. 互动状态
    // ========================================================================
    if (cat.state === 'interacting') {
      cat.interactionTimer--; // 减少互动时间
      cat.animFrame++; // 推进动画帧
      if (cat.currentAnimation) cat.setSprite(cat.currentAnimation, cat.animFrame);

      // 互动结束
      if (cat.interactionTimer <= 0) {
        cat.state = 'roam';
        cat.currentAnimation = null;
        cat.speed = baseSpeed;
        cat.showThought("👋"); // 告别表情
        cat.waitTimer = 0;
        // 设置随机新目标
        cat.targetX = Math.random() * window.innerWidth;
        cat.targetY = Math.random() * window.innerHeight;
      }
      return;
    }

    // ========================================================================
    // D. 播放单体动画
    // ========================================================================
    if (cat.currentAnimation && cat.state !== 'meeting') {
      cat.animFrame++; // 推进动画帧
      cat.setSprite(cat.currentAnimation, cat.animFrame);

      // 根据动画类型设置不同的持续时间
      let limit;
      if (cat.currentAnimation === 'sleeping') {
        limit = 60; // 睡眠动画较长
      } else if (cat.currentAnimation.startsWith('scratchWall')) {
        limit = 10; // 挠墙动画较短
      } else {
        limit = 15; // 其他动画
      }

      // 动画播放完毕
      if (cat.animFrame > limit) {
        const wasThisAnimation = cat.currentAnimation;
        cat.currentAnimation = null;

        // 根据状态和之前的动画决定下一步行为
        if (cat.state === 'watch') {
          // 观看状态下动画结束，继续观看
          cat.idleTime = 0; // 重置idle时间
          return;
        } else if (cat.state === 'roam' && wasThisAnimation === 'tired') {
          // 如果刚完成tired动画（来自追逐鼠标），接着做舔毛动画
          cat.currentAnimation = 'scratchSelf';
          cat.animFrame = 0;
          cat.showThought("😸", 2000);
          return;
        } else {
          // 其他情况回到漫游状态
          cat.state = 'roam';
          cat.waitTimer = 20 + Math.random() * 30;
        }
      }
      return;
    }

    // ========================================================================
    // E. 物理层与决策层
    // ========================================================================

    // 计算到目标位置的距离
    const dist = Math.sqrt((cat.targetX - cat.posX)**2 + (cat.targetY - cat.posY)**2);

    // 检测是否被其他猫阻挡（用于watch状态的宽松到达判定）
    let isBlockedByOtherCat = false;
    if (cat.state === 'watch' && dist < 60) {
      for (const other of cats) {
        if (other === cat) continue;
        const distToOther = Math.sqrt((cat.posX - other.posX)**2 + (cat.posY - other.posY)**2);
        if (distToOther < MIN_CAT_DISTANCE * 1.2) {
          isBlockedByOtherCat = true;
          break;
        }
      }
    }

    // 到达目的地的检测（使用固定阈值，避免速度影响）
    // watch状态下如果被阻挡且距离较近，也视为到达
    if (dist < 16 || (cat.state === 'watch' && isBlockedByOtherCat)) {
       // 只有真正到达时才精确设置到目标位置（被阻挡时保持当前位置）
       if (dist < 16) {
         cat.posX = cat.targetX;
         cat.posY = cat.targetY;
       }

       // ------------------------------------------------------------------------
       // 1. 约会状态
       // ------------------------------------------------------------------------
       if (cat.state === 'meeting') {
          const partner = cat.interactionPartner;
          if (partner) {
             // 检查到伙伴的距离
             const distToPartner = Math.sqrt((cat.posX - partner.posX)**2 + (cat.posY - partner.posY)**2);
             if (distToPartner < 50) {
               startSharedInteraction(cat, partner); // 开始共同互动
             } else {
               cat.setSprite('idle', 0); // 等待伙伴到达
             }
          } else {
             cat.state = 'roam'; // 伙伴不存在，回到漫游
          }
          return;
       }

       // ------------------------------------------------------------------------
       // 2. 观看Switch状态
       // ------------------------------------------------------------------------
       if (cat.state === 'watch') {
         if (isSwitchActive && switchEl) {
           // 到达观看位置，进入静止观看状态
           cat.speed = baseSpeed; // 重置速度为正常值
           cat.idleTime++; // 增加空闲时间

           // 参考原始oneko.js的idle逻辑触发随机动画
           if (cat.idleTime > 10 && Math.floor(Math.random() * 100) == 0 && !cat.currentAnimation) {
             // 选择观看时的随机动画
             const watchAnimations = ['scratchSelf', 'sleeping', 'tired'];

             // 根据位置添加挠墙动画
             if (cat.posX < CAT_SIZE * 1.5) watchAnimations.push('scratchWallW');
             if (cat.posY < CAT_SIZE * 1.5) watchAnimations.push('scratchWallN');
             if (cat.posX > window.innerWidth - CAT_SIZE * 1.5) watchAnimations.push('scratchWallE');
             if (cat.posY > window.innerHeight - CAT_SIZE * 1.5) watchAnimations.push('scratchWallS');

             // 随机选择并开始动画
             cat.currentAnimation = watchAnimations[Math.floor(Math.random() * watchAnimations.length)];
             cat.animFrame = 0;

             // 显示对应的思考泡泡
             const thoughtEmojis = {
               'scratchSelf': '😸', 'sleeping': '💤', 'tired': '😴',
               'scratchWallW': '🐾', 'scratchWallN': '🐾', 'scratchWallE': '🐾', 'scratchWallS': '🐾'
             };
             if (thoughtEmojis[cat.currentAnimation]) {
               cat.showThought(thoughtEmojis[cat.currentAnimation], 2000);
             }
             return;
           }

           // 没有动画时显示正确的静止姿势
           if (!cat.currentAnimation) {
             cat.setSprite('idle', 0); // 默认idle状态而非移动状态
           }
           return;
         } else {
           // Switch关闭了，切换到漫游
           cat.state = 'roam';
           cat.waitTimer = 0;
           cat.idleTime = 0;
         }
       }

       // ------------------------------------------------------------------------
       // 3. Zoomies结束
       // ------------------------------------------------------------------------
       if (cat.state === 'zoomies') {
         cat.state = 'roam';
         cat.speed = baseSpeed;
         cat.waitTimer = 30;
       }

       // ------------------------------------------------------------------------
       // 4. 正常逻辑 (漫游/发呆状态)
       // ------------------------------------------------------------------------
       if (['roam', 'idle'].includes(cat.state)) {

         // 处理等待时间（懒惰机制）
         if (cat.waitTimer > 0) {
           cat.waitTimer--;
           if (!cat.currentAnimation) cat.setSprite('idle', 0); // 显示静止状态
           // 小概率在发呆时做随机动作
           if (Math.random() < 0.05) handleIdleAnimation(cat);
           return;
         }

         // 检查是否有可追踪的球（高优先级，但Switch激活时不追球）
         if (!isSwitchActive && pixelBalls.length > 0) {
           // 选择第一个未被claimed的球开始追踪（无距离限制）
           const targetBall = pixelBalls.find(ball => !ball.claimed);
           if (targetBall) {
             cat.state = 'chasing';
             cat.chasingTarget = targetBall;
             cat.speed = baseSpeed * 1.8; // 提高速度
             cat.showThought("👀"); // 兴奋表情
             cat.waitTimer = 0;
             cat.currentAnimation = null;
             return;
           }
         }

         // 决策下一步行动
         if (isSwitchActive && switchEl) {
            handleSwitchMode(cat); // Switch激活时去观看
         } else {
            // 没有Switch时的自由活动
            const roll = Math.random();
            if (roll < 0.6) { // 60% 概率原地发呆
               cat.waitTimer = 20 + Math.random() * 40;
               handleIdleAnimation(cat);
            } else { // 40% 概率移动
               if (Math.random() < 0.1) makeIndividualDecision(cat); // 个人决定（睡觉/zoomies）
               else handleRoamMode(cat); // 普通漫游
            }
         }
       }
       return; // 结束本帧逻辑
    }

    // ========================================================================
    // F. 移动物理
    // ========================================================================

    // 如果还没到达目的地，继续移动
    cat.posX += ((cat.targetX - cat.posX) / dist) * cat.speed;
    cat.posY += ((cat.targetY - cat.posY) / dist) * cat.speed;

    // 限制在屏幕范围内
    cat.posX = clamp(cat.posX, CAT_HALF, window.innerWidth - CAT_HALF);
    cat.posY = clamp(cat.posY, CAT_HALF, window.innerHeight - CAT_HALF);

    // 移动时重置观看的idle时间
    if (cat.state === 'watch') {
      cat.idleTime = 0;
    }

    // ------------------------------------------------------------------------
    // 计算移动方向并设置动画（参考原始oneko.js）
    // ------------------------------------------------------------------------
    let direction = "";
    const dx = cat.targetX - cat.posX;  // X轴差值
    const dy = cat.targetY - cat.posY;  // Y轴差值

    // 根据移动方向确定动画方向
    if (dy / dist > 0.5) direction = "S";      // 向南
    else if (dy / dist < -0.5) direction = "N"; // 向北

    if (dx / dist > 0.5) direction += "E";      // 向东
    else if (dx / dist < -0.5) direction += "W"; // 向西

    // 默认方向
    if (!direction) direction = "E";

    // 方向降级：如果找不到8方向动画，使用4方向
    if (!spriteSets[direction]) {
      if (Math.abs(dx) > Math.abs(dy)) {
        direction = dx > 0 ? "E" : "W";  // 水平优先
      } else {
        direction = dy > 0 ? "S" : "N";  // 垂直优先
      }
    }

    // 设置移动动画（在帧0和帧1之间交替）
    // cat.setSprite(direction, Math.floor(frameCount / 4) % 2);
    if (cat.state === 'watch' && dist < 5) {
       cat.setSprite('idle', 0); // 或者根据方向显示坐着的侧面，如果素材支持的话
    } else {
       cat.setSprite(direction, frameCount % 2); 
    }
    cat.updatePosition(); // 更新DOM位置
  }

  // ============================================================================
  // 11. 辅助行为函数
  // ============================================================================

  // 统一碰撞检测函数（高性能版本）
  const CAT_COLLISION_RADIUS = CAT_HALF * 0.9; // 小猫碰撞半径（基于缩放）
  const MIN_CAT_DISTANCE = CAT_COLLISION_RADIUS * 2; // 最小距离

  function handleCatCollisions() {
    const len = cats.length;
    if (len < 2) return; // 只有一只猫时不需要检测

    // 多次迭代确保完全分离（追球时可能多只猫聚集）
    for (let iter = 0; iter < 3; iter++) {
      // 双重循环检测所有猫对（避免重复检测）
      for (let i = 0; i < len; i++) {
        for (let j = i + 1; j < len; j++) {
          const cat1 = cats[i];
          const cat2 = cats[j];

          if (cat1.state === 'watch' && cat2.state === 'watch' && 
            cat1.currentAnimation === 'idle' && cat2.currentAnimation === 'idle') {
            continue; 
          }

          const dx = cat1.posX - cat2.posX;
          const dy = cat1.posY - cat2.posY;

          // 快速距离检测（避免开方运算）
          const distSq = dx * dx + dy * dy;
          const minDistSq = MIN_CAT_DISTANCE * MIN_CAT_DISTANCE;

          if (distSq < minDistSq && distSq > 0) {
            // 只有在确实重叠时才计算精确距离
            const distance = Math.sqrt(distSq);
            const overlap = MIN_CAT_DISTANCE - distance;

            // 计算推开向量（增强推力）
            const pushX = (dx / distance) * overlap * 0.6;
            const pushY = (dy / distance) * overlap * 0.6;

            // 两只猫各自推开一半距离
            cat1.posX += pushX;
            cat1.posY += pushY;
            cat2.posX -= pushX;
            cat2.posY -= pushY;

            // 限制在屏幕范围内
            cat1.posX = clamp(cat1.posX, CAT_HALF, window.innerWidth - CAT_HALF);
            cat1.posY = clamp(cat1.posY, CAT_HALF, window.innerHeight - CAT_HALF);
            cat2.posX = clamp(cat2.posX, CAT_HALF, window.innerWidth - CAT_HALF);
            cat2.posY = clamp(cat2.posY, CAT_HALF, window.innerHeight - CAT_HALF);
          }
        }
      }
    }

    // 统一更新DOM位置
    cats.forEach(cat => cat.updatePosition());
  }

  // 获取面向目标元素的方向（用于观看）
  function getDirection(cat, targetEl) {
    if(!targetEl) return 'idle';
    const rect = targetEl.getBoundingClientRect();
    const cx = rect.left + rect.width/2;  // 目标中心X
    const cy = rect.top + rect.height/2;  // 目标中心Y

    // 简单的方向判断
    if (cat.posY < cy) return "S"; // 小猫在目标上方，面向南
    if (cat.posX < cx) return "E"; // 小猫在目标左侧，面向东
    return "W"; // 默认面向西
  }

  // 开始两只猫的共同互动
  function startSharedInteraction(c1, c2) {
    // 如果已经在互动中，跳过
    if (c1.state === 'interacting' || c2.state === 'interacting') return;

    const duration = 50 + Math.floor(Math.random() * 40); // 互动持续时间

    // 互动场景选择
    const scenarios = [
      { anim: 'scratchSelf', emoji: '❤️' }, // 一起舔毛
      { anim: 'sleeping', emoji: '💤' },     // 一起睡觉
      { anim: 'idle', emoji: '🎵' }          // 一起聊天
    ];
    const scene = scenarios[Math.floor(Math.random() * scenarios.length)];

    // 设置两只猫的互动状态
    c1.state = 'interacting'; c1.interactionTimer = duration;
    c1.currentAnimation = scene.anim; c1.animFrame = 0;
    c1.showThought(scene.emoji, 4000);

    c2.state = 'interacting'; c2.interactionTimer = duration;
    c2.animFrame = 0; c2.showThought(scene.emoji, 4000);

    // 特殊场景：聊天时一只演奏，一只倾听
    if (scene.emoji === '🎵') {
      c1.currentAnimation = 'idle';
      c2.currentAnimation = 'alert';
    } else {
      c2.currentAnimation = scene.anim;
    }
  }

  // 个人决定（睡觉、zoomies或追逐鼠标）
  function makeIndividualDecision(cat) {
    const roll = Math.random();
    const now = Date.now();

    // 检查是否可以追逐鼠标（冷却时间已过，且没有其他猫在追）
    const canChaseMouse = !currentMouseFollower &&
                         !isSwitchActive &&
                         (now - lastMouseChaseTime) > MOUSE_CHASE_COOLDOWN &&
                         mousePos.x > 0 && mousePos.y > 0 &&
                         cat.state !== 'watch';

    if (roll < 0.3) {
      // 30% 概率睡觉
      cat.showThought("💤");
      cat.currentAnimation = 'sleeping';
      cat.animFrame = 0;
    }
    else if (roll < 0.4) {
      // 10% 概率快速跑动（zoomies）
      cat.showThought("💨");
      cat.state = 'zoomies';
      cat.speed = baseSpeed * 3;
      cat.targetX = Math.random() * window.innerWidth;
      cat.targetY = Math.random() * window.innerHeight;
    }
    else if (roll < 0.6 && canChaseMouse) {
      // 20% 概率追逐鼠标（如果满足条件）
      cat.startFollowingMouse();
    }
  }

  // 处理Switch观看模式
  function handleSwitchMode(cat) {
    if (cat.state !== 'watch') cat.state = 'watch';

    if (!switchEl) return;
    const rect = switchEl.getBoundingClientRect();

    // 设置随机观看位置（避免所有猫聚集在同一点）
    // const randomOffsets = [
    //   { x: -50 - Math.random() * 30, y: rect.height - 20 + Math.random() * 20 }, // 左侧
    //   { x: rect.width + 20 + Math.random() * 30, y: rect.height - 20 + Math.random() * 20 }, // 右侧
    //   { x: rect.width/2 - 16 + (Math.random() - 0.5) * 40, y: rect.height + 20 + Math.random() * 20 }, // 下方
    //   { x: rect.width/2 - 16 + (Math.random() - 0.5) * 60, y: -30 - Math.random() * 20 } // 上方
    // ];

    // 根据猫的ID选择位置（确保分布）
    // const offset = randomOffsets[cat.id % randomOffsets.length];
    // cat.targetX = rect.left + offset.x;
    // cat.targetY = rect.top + offset.y;

    // 如果这只猫还没有选定座位，或者座位无效，就给它分配一个随机座位
    if (!cat.watchOffset) {
       // 定义距离 Switch 的安全距离（边距）
       const margin = 20;

       // 随机选择方向，偏好下方（60%下方，20%左侧，20%右侧）
       const roll = Math.random();
       let side;
       if (roll < 0.6) {
         side = 1; // 下方
       } else if (roll < 0.8) {
         side = 0; // 右侧
       } else {
         side = 2; // 左侧
       }

       let offsetX = 0;
       let offsetY = 0;
       // 生成相对于 Switch 左上角 (rect.left, rect.top) 的偏移量
       switch(side) {
          case 0: // 右侧 (Right)
             offsetX = rect.width + margin;
             offsetY = Math.random() * rect.height; // 高度范围内随机
             break;
          case 1: // 下方 (Bottom)
             offsetX = Math.random() * rect.width;
             offsetY = rect.height + margin;
             break;
          case 2: // 左侧 (Left)
             offsetX = -32 - margin;
             offsetY = Math.random() * rect.height;
             break;
       }
       // 稍微增加一点随机抖动，让它们不要排得太直
       offsetX += (Math.random() - 0.5) * 20;
       offsetY += (Math.random() - 0.5) * 20;
       // 记住这个位置！
       cat.watchOffset = { x: offsetX, y: offsetY };
    }
    // 应用记下来的位置
    cat.targetX = rect.left + cat.watchOffset.x;
    cat.targetY = rect.top + cat.watchOffset.y;

    // 限制在屏幕范围内
    cat.targetX = clamp(cat.targetX, CAT_HALF, window.innerWidth - CAT_HALF);
    cat.targetY = clamp(cat.targetY, CAT_HALF, window.innerHeight - CAT_HALF);
    cat.speed = baseSpeed * 1.2; // 稍微提速
  }

  // 处理漫游模式
  function handleRoamMode(cat) {
    const isM = isMobile();
    const zone = getRestrictedZone();

    // 设置随机目标位置
    if (isM) {
      // 移动端：整个屏幕
      cat.targetX = Math.random() * (window.innerWidth - 32) + 16;
      cat.targetY = Math.random() * (window.innerHeight - 32) + 16;
    } else {
      // 桌面端：避开中心内容区域
      const goLeft = Math.random() > 0.5;
      if (goLeft) {
        cat.targetX = Math.random() * (zone.left - 50);
      } else {
        cat.targetX = zone.right + 50 + Math.random() * (window.innerWidth - zone.right - 66);
      }
      cat.targetX = clamp(cat.targetX, CAT_HALF, window.innerWidth - CAT_SIZE);
      cat.targetY = Math.random() * (window.innerHeight - CAT_SIZE);
    }
  }

  // 处理发呆时的随机动画
  function handleIdleAnimation(cat) {
     // 基础动画选项
     const actions = ['scratchSelf', 'tired', 'alert'];

     // 根据位置添加挠墙动画
     if (cat.posY > window.innerHeight - 50) actions.push('scratchWallS');
     if (cat.posX < 50) actions.push('scratchWallW');

     // 随机选择动画
     cat.currentAnimation = actions[Math.floor(Math.random() * actions.length)];
     cat.animFrame = 0;
  }

  // ============================================================================
  // 12. 启动应用
  // ============================================================================

  // 启动初始化函数
  init();
})();