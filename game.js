// 定义花色和点数
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 牌类
class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.faceUp = false;
    }

    getRankValue() {
        return RANKS.indexOf(this.rank);
    }

    getImagePath() {
        if (!this.faceUp) {
            return 'pic/Back of a card@1x.png';
        }
        const suitMap = { '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣' };
        return `pic/${this.rank}${suitMap[this.suit]}@1x.png`;
    }
}

// 游戏类
class SolitaireGame {
    constructor(mode = 'simple') {
        this.mode = mode;
        this.deck = this.createDeck();
        this.wastePiles = { '♠': [], '♥': [], '♦': [], '♣': [] };
        this.tableau = [];
        this.leftKPiles = [[], []];
        this.rightKPiles = [[], []];
        this.moveCount = 0;
        this.selectedCards = null;
        this.hintEnabled = false;
        this.isDragging = false;
        this.dragCards = [];
        this.dragCardOffsets = [];
        this.dragOriginalStyles = [];
        this.rafId = null;
        this.currentDropTarget = null; // 当前悬停的目标牌
        this.revealingCards = []; // 记录刚被翻开的牌，用于播放翻转动画
        this.gameLogs = []; // 日志记录
        this.setupGame();
        this.render();
        this.updateMoveCount();
        this.updateStatus('点击并拖动牌到目标位置');
    }

    logAction(msg) {
        const time = new Date().toLocaleTimeString();
        const logMsg = `[${time}] ${msg}`;
        this.gameLogs.push(logMsg);
        console.log(logMsg);
        
        const logContainer = document.getElementById('gameLogContent');
        if (logContainer) {
            logContainer.innerHTML += `<div>${logMsg}</div>`;
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    toggleHint() {
        this.hintEnabled = !this.hintEnabled;
        const hintBtn = document.getElementById('hintBtn');
        hintBtn.textContent = `提示: ${this.hintEnabled ? '开' : '关'}`;
        hintBtn.classList.toggle('active', this.hintEnabled);
    }

    createDeck() {
        const deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push(new Card(suit, rank));
            }
        }
        // Fisher-Yates 洗牌算法
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    setupGame() {
        this.logAction('----- 新的一局游戏开始 (' + this.mode + '模式) -----');
        // 初始化8列表
        this.tableau = Array(8).fill(null).map(() => []);

        // 先摆两行暗牌（每列各2张）- 所有模式都一样
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 8; col++) {
                if (this.deck.length > 0) {
                    const card = this.deck.pop();
                    card.faceUp = false;
                    this.tableau[col].push(card);
                }
            }
        }

        // 再摆八行阶梯明牌
        for (let row = 2; row < 10; row++) {
            for (let col = row - 2; col < 8; col++) {
                if (this.deck.length > 0) {
                    const card = this.deck.pop();
                    card.faceUp = true;
                    this.tableau[col].push(card);
                }
            }
        }

        // 初始动画由 constructor 和 restart() 中调用的 processAutomaticMoves() 触发
    }

    async processAutomaticMoves(targetCol = null) {
        if (this.isProcessingAuto) return;
        this.isProcessingAuto = true;

        let changed = true;
        while (changed) {
            changed = false;

            const hasRevealing = this.revealingCards.length > 0;
            this.render(); // 渲染任何已有的逻辑变更（并在内部清空 revealingCards）
            
            // 等待翻牌动画完成
            if (hasRevealing) {
                await new Promise(resolve => setTimeout(resolve, 650));
            }

            // 1. 检查是否有需要自动飞走的 K (即刚翻开的K)
            const kingsToMove = [];
            for (let col = 0; col < 8; col++) {
                const pile = this.tableau[col];
                for (let i = 0; i < pile.length; i++) {
                    if (pile[i].faceUp && pile[i].rank === 'K' && pile[i].autoMoveToK) {
                        kingsToMove.push({ col, startIdx: i, card: pile[i] });
                        pile[i].autoMoveToK = false; // 清除标记
                        break; 
                    }
                }
            }

            if (kingsToMove.length > 0) {
                const flyingPromises = kingsToMove.map(async ({ col, startIdx, card }) => {
                    const pile = this.tableau[col];
                    const cardsToMove = pile.slice(startIdx);
                    
                    const colIdxAbsolute = 2 + col;
                    
                    // 获取目标槽位索引
                    let targetCol = 0;
                    if (card.suit === '♠') targetCol = 0;
                    else if (card.suit === '♥') targetCol = 1;
                    else if (card.suit === '♣') targetCol = 10;
                    else if (card.suit === '♦') targetCol = 11;
                    
                    let targetPileStr = targetCol < 2 ? '左侧K堆' : '右侧K堆';
                    let isLeft = targetCol < 2;

                    // 获取将要飞行的 DOM
                    const flyingCards = [];
                    const columnEl = document.querySelector(`.tableau-column[data-col="${colIdxAbsolute}"]`);
                    if (columnEl) {
                        const allCards = Array.from(columnEl.querySelectorAll('.card'));
                        allCards.forEach(c => {
                            if (parseInt(c.dataset.row) >= startIdx) {
                                flyingCards.push(c);
                            }
                        });
                    }

                    // 数据逻辑移除
                    pile.splice(startIdx);
                    if (isLeft) {
                        this.leftKPiles[targetCol].push(...cardsToMove);
                    } else {
                        this.rightKPiles[targetCol - 10].push(...cardsToMove);
                    }
                    this.logAction(`K牌自动移出: 从列[${col}]移至${targetPileStr}槽位[${targetCol}] (携带 ${cardsToMove.length} 张牌)`);

                    // 动画阶段
                    if (flyingCards.length > 0) {
                        let slotEl;
                        if (isLeft) {
                            slotEl = document.querySelectorAll('#leftKPiles .k-pile')[targetCol];
                        } else {
                            slotEl = document.querySelectorAll('#rightKPiles .k-pile')[targetCol - 10];
                        }
                        
                        if (slotEl) {
                            const baseRect = slotEl.getBoundingClientRect();
                            const clones = [];
                            flyingCards.forEach((cardEl, idx) => {
                                const startRect = cardEl.getBoundingClientRect();
                                const clone = cardEl.cloneNode(true);
                                clone.style.position = 'fixed';
                                clone.style.left = startRect.left + 'px';
                                clone.style.top = startRect.top + 'px';
                                clone.style.zIndex = 5000 + idx;
                                clone.style.transition = 'all 0.4s ease-in-out';
                                document.body.appendChild(clone);
                                clones.push(clone);
                                
                                cardEl.style.opacity = '0'; // 隐藏原DOM避免重影
                            });
                            
                            clones[0].getBoundingClientRect(); // 强制重排
                            
                            clones.forEach((clone, idx) => {
                                clone.style.left = baseRect.left + 'px';
                                clone.style.top = (baseRect.top + idx * 35) + 'px';
                            });
                            
                            await new Promise(resolve => setTimeout(resolve, 400));
                            clones.forEach(c => c.remove());
                        }
                    }
                    
                    // 检查此列暴露的牌
                    this.checkReveal(col, true);
                    changed = true;
                });
                
                await Promise.all(flyingPromises);
                continue;
            }

            // 2. 检查是否有完成序列
            const totalCols = 12;
            if (targetCol !== null && this.checkCompleteSequenceData(targetCol)) {
                changed = true;
                targetCol = null;
                continue;
            }
            for (let c = 0; c < totalCols; c++) {
                if (this.checkCompleteSequenceData(c)) {
                    changed = true;
                    break;
                }
            }
        }
        
        this.render();
        this.checkGameEnd();
        this.isProcessingAuto = false;
    }

    checkReveal(colIdx, animate = false) {
        const pile = this.tableau[colIdx];
        if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
            const cardToReveal = pile[pile.length - 1];
            cardToReveal.faceUp = true;
            this.logAction(`翻开暗牌: 列[${colIdx}] (值为 ${cardToReveal.suit}${cardToReveal.rank})`);
            if (animate) {
                this.revealingCards.push(cardToReveal);
            }
            if (cardToReveal.rank === 'K') {
                cardToReveal.autoMoveToK = true;
            }
        }
    }

    getPile(colIdx) {
        if (colIdx < 2) {
            return this.leftKPiles[colIdx];
        } else if (colIdx < 10) {
            return this.tableau[colIdx - 2];
        } else {
            return this.rightKPiles[colIdx - 10];
        }
    }

    isEmptyColumn(colIdx) {
        const pile = this.getPile(colIdx);
        return pile.length === 0;
    }

    isValidMove(fromCol, fromRow, toCol) {
        if (fromCol === toCol) return false;

        const fromPile = this.getPile(fromCol);
        const toPile = this.getPile(toCol);

        if (fromRow < 0 || fromRow >= fromPile.length) return false;
        if (!fromPile[fromRow].faceUp) return false;

        const fromCard = fromPile[fromRow];

        // 目标是K牌堆（如果是移到K牌堆的空槽）
        if (toCol < 2 || toCol >= 10) {
            if (toPile.length === 0) {
                if (fromCard.rank !== 'K') return false;
                const targetSuit = toCol === 0 ? '♠' :
                                   toCol === 1 ? '♥' :
                                   toCol === 10 ? '♣' : '♦';
                return fromCard.suit === targetSuit;
            }
            // 如果K牌堆已经有牌，则走正常的接牌逻辑，不在此处 return
        }

        // 目标为主牌桌空列
        if (toPile.length === 0) {
            if (this.mode === 'hard') return false;
            if (fromCard.rank === 'K') return false; // K必须去K槽，不能去空牌桌
            if (this.mode === 'normal') {
                const cardsToMove = fromPile.slice(fromRow);
                for (let i = 0; i < cardsToMove.length - 1; i++) {
                    if (cardsToMove[i].suit !== cardsToMove[i + 1].suit) return false;
                    if (cardsToMove[i + 1].getRankValue() !== cardsToMove[i].getRankValue() - 1) return false;
                }
            }
            return true;
        }

        // 目标有牌，检查同花色递减
        const toCard = toPile[toPile.length - 1];

        return fromCard.suit === toCard.suit &&
               fromCard.getRankValue() === toCard.getRankValue() - 1;
    }

    moveCard(fromCol, fromRow, toCol) {
        if (!this.isValidMove(fromCol, fromRow, toCol)) return false;

        const fromPile = this.getPile(fromCol);
        const toPile = this.getPile(toCol);

        const cardsToMove = fromPile.slice(fromRow);
        toPile.push(...cardsToMove);
        fromPile.splice(fromRow);

        this.logAction(`移动牌: 从列[${fromCol}] (row ${fromRow}) 到列[${toCol}], 牌为 ${cardsToMove[0].suit}${cardsToMove[0].rank} 等 ${cardsToMove.length} 张`);

        // 检查源列是否在主牌桌区域
        if (fromCol >= 2 && fromCol < 10) {
            this.checkReveal(fromCol - 2, true);
        }

        this.moveCount++;
        this.updateMoveCount();
        
        // 触发自动检查和动画流程
        this.processAutomaticMoves(toCol);

        return true;
    }

    checkCompleteSequenceData(colIdx) {
        const pile = this.getPile(colIdx);
        if (pile.length < 13) return false;

        const expectedRanks = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'];

        for (let i = 0; i <= pile.length - 13; i++) {
            const subPile = pile.slice(i, i + 13);
            const ranks = subPile.map(c => c.rank);

            if (ranks.join(',') === expectedRanks.join(',') && 
                subPile.every(c => c.faceUp) &&
                subPile.every(c => c.suit === subPile[0].suit)) {
                
                const suit = subPile[0].suit;
                this.wastePiles[suit] = subPile.slice();
                pile.splice(i, 13);
                
                this.logAction(`完成一条完整的序列: ${suit} A-K，已移入目标花色堆`);

                if (colIdx >= 2 && colIdx < 10) {
                    this.checkReveal(colIdx - 2, true);
                }
                return true;
            }
        }
        return false;
    }

    isGameWon() {
        return SUITS.every(suit => this.wastePiles[suit].length === 13);
    }

    isGameOver() {
        const totalCols = this.leftKPiles.length + 8 + this.rightKPiles.length;
        
        for (let fromCol = 0; fromCol < totalCols; fromCol++) {
            const fromPile = this.getPile(fromCol);
            for (let fromRow = 0; fromRow < fromPile.length; fromRow++) {
                if (!fromPile[fromRow].faceUp) continue;
                for (let toCol = 0; toCol < totalCols; toCol++) {
                    if (fromCol !== toCol && this.isValidMove(fromCol, fromRow, toCol)) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    // 检查两个 DOM 元素是否有重叠区域
    isOverlapping(el1, el2) {
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();

        return !(rect1.right < rect2.left || 
                 rect1.left > rect2.right || 
                 rect1.bottom < rect2.top || 
                 rect1.top > rect2.bottom);
    }

    checkGameEnd() {
        if (this.isGameWon()) {
            this.showBanner(true);
        } else if (this.isGameOver()) {
            this.showBanner(false);
        }
    }

    showBanner(won) {
        const banner = document.getElementById('gameBanner');
        const title = document.getElementById('bannerTitle');
        const message = document.getElementById('bannerMessage');

        if (won) {
            title.textContent = '🎉 恭喜获胜！';
            message.textContent = `你成功完成了游戏，共用了 ${this.moveCount} 步！`;
            title.classList.add('win-animation');
            // 简单的粒子特效/全屏烟花效果
            this.playFireworks();
        } else {
            title.textContent = '没有可用移动了';
            message.textContent = `已进入死局。共尝试了 ${this.moveCount} 步。您可以查看当前残局或重新开始。`;
            title.classList.remove('win-animation');
        }

        banner.classList.add('show');
    }

    playFireworks() {
        const canvas = document.getElementById('fireworksCanvas');
        if (!canvas) return;
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

        for (let i = 0; i < 150; i++) {
            particles.push({
                x: canvas.width / 2,
                y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 0.5) * 15,
                size: Math.random() * 5 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1
            });
        }

        const animate = () => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            let active = false;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (p.life > 0) {
                    active = true;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = p.color;
                    ctx.fill();

                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.1; // gravity
                    p.life -= 0.01;
                }
            }

            if (active) {
                requestAnimationFrame(animate);
            } else {
                canvas.style.display = 'none';
            }
        };
        animate();
    }

    updateMoveCount() {
        document.getElementById('moveCount').textContent = this.moveCount;
    }

    updateStatus(message) {
        document.getElementById('statusBar').textContent = message;
    }

    render() {
        this.renderFoundation();
        this.renderTableau();
        // 渲染完成后清空翻开记录，确保动画只播放一次
        this.revealingCards = [];
    }

    renderFoundation() {
        const piles = document.querySelectorAll('.foundation-pile');
        piles.forEach((pile, index) => {
            const suit = SUITS[index];
            const cards = this.wastePiles[suit];
            const colorClass = suit === '♥' || suit === '♦' ? 'red' : 'black';
            
            if (cards.length > 0) {
                const topCard = cards[cards.length - 1];
                pile.innerHTML = `
                    <div class="card face-up ${colorClass}" style="position: static;">
                        <div class="card-front"></div>
                        <div class="card-back ${colorClass}">
                            <div class="card-top">
                                <span>${topCard.rank}</span>
                                <span>${topCard.suit}</span>
                            </div>
                            <div class="card-middle">${topCard.suit}</div>
                            <div class="card-bottom">
                                <span>${topCard.rank}</span>
                                <span>${topCard.suit}</span>
                            </div>
                        </div>
                    </div>
                `;
                pile.style.border = '2px solid #ffd700';
            } else {
                pile.innerHTML = `
                    <div class="card back" style="position: static; opacity: 0.3;"></div>
                `;
                pile.style.border = '2px dashed rgba(255,255,255,0.3)';
            }
        });
    }

    renderTableau() {
        // 清空现有内容
        document.getElementById('leftKPiles').innerHTML = '';
        document.getElementById('tableau').innerHTML = '';
        document.getElementById('rightKPiles').innerHTML = '';

        // 渲染左侧K牌堆 (0: ♠, 1: ♥)
        for (let i = 0; i < 2; i++) {
            const div = document.createElement('div');
            div.className = 'k-pile';
            div.dataset.col = i;

            const pile = this.leftKPiles[i];
            if (pile.length > 0) {
                pile.forEach((card, rowIdx) => {
                    const cardDiv = this.createCardElement(card, i, rowIdx, pile.length);
                    div.appendChild(cardDiv);
                });
            } else {
                const suit = i === 0 ? '♠' : '♥';
                if (this.wastePiles[suit].length < 13) {
                    const fakeCard = new Card(suit, 'K');
                    fakeCard.faceUp = true;
                    const cardDiv = this.createCardElement(fakeCard, i, 0, 1);
                    cardDiv.style.opacity = '0.35';
                    cardDiv.style.position = 'static';
                    cardDiv.style.pointerEvents = 'none';
                    div.appendChild(cardDiv);
                }
                div.style.border = '2px dashed rgba(255,255,255,0.3)';
            }
            document.getElementById('leftKPiles').appendChild(div);
        }

        // 渲染主牌桌
        this.tableau.forEach((pile, index) => {
            const div = document.createElement('div');
            div.className = 'tableau-column';
            div.dataset.col = 2 + index;
            
            pile.forEach((card, rowIdx) => {
                const cardDiv = this.createCardElement(card, 2 + index, rowIdx, pile.length);
                div.appendChild(cardDiv);
            });
            
            document.getElementById('tableau').appendChild(div);
        });

        // 渲染右侧K牌堆 (0: ♣, 1: ♦ -> col=10, 11)
        for (let i = 0; i < 2; i++) {
            const div = document.createElement('div');
            div.className = 'k-pile';
            const colIndex = 10 + i;
            div.dataset.col = colIndex;

            const pile = this.rightKPiles[i];
            if (pile.length > 0) {
                pile.forEach((card, rowIdx) => {
                    const cardDiv = this.createCardElement(card, colIndex, rowIdx, pile.length);
                    div.appendChild(cardDiv);
                });
            } else {
                const suit = i === 0 ? '♣' : '♦';
                if (this.wastePiles[suit].length < 13) {
                    const fakeCard = new Card(suit, 'K');
                    fakeCard.faceUp = true;
                    const cardDiv = this.createCardElement(fakeCard, colIndex, 0, 1);
                    cardDiv.style.opacity = '0.35';
                    cardDiv.style.position = 'static';
                    cardDiv.style.pointerEvents = 'none';
                    div.appendChild(cardDiv);
                }
                div.style.border = '2px dashed rgba(255,255,255,0.3)';
            }
            document.getElementById('rightKPiles').appendChild(div);
        }

        // 计算并应用动态最小高度
        this.updateBoardHeight();

        // 添加事件监听
        this.addCardEvents();
    }

    updateBoardHeight() {
        let maxCards = 0;
        const allPiles = [...this.leftKPiles, ...this.tableau, ...this.rightKPiles];
        allPiles.forEach(pile => {
            if (pile.length > maxCards) {
                maxCards = pile.length;
            }
        });
        
        // 每个卡牌偏移 35px，卡牌本身高度 96px，预留底部 padding 20px
        const requiredHeight = maxCards > 0 ? (maxCards - 1) * 35 + 96 + 20 : 0;
        
        // 保持原本的默认基础高度 900px
        const finalHeight = Math.max(900, requiredHeight);
        
        // 动态设置各区域的容器和列的最小高度
        const columns = document.querySelectorAll('.tableau-column, .k-pile');
        columns.forEach(col => {
            col.style.minHeight = finalHeight + 'px';
        });
        
        const containers = document.querySelectorAll('.tableau, .k-piles');
        containers.forEach(container => {
            container.style.minHeight = finalHeight + 'px';
        });
    }

    createCardElement(card, colIdx, rowIdx, totalRows) {
        const div = document.createElement('div');

        // 检查是否是刚被翻开的牌
        const isRevealing = this.revealingCards.includes(card);

        // 添加花色颜色类
        const colorClass = card.suit === '♥' || card.suit === '♦' ? 'red' : 'black';

        div.className = 'card';
        if (isRevealing) {
            // 动画期间：附加 colorClass 解决红心方块翻转时颜色发黑的问题
            div.classList.add('back', 'facedown', 'revealing', colorClass);
            // 动画结束后，切换为明牌状态并清除动画残留
            div.addEventListener('animationend', () => {
                div.classList.remove('back', 'facedown', 'revealing');
                div.classList.add('face-up', colorClass);
            }, { once: true });
        } else if (card.faceUp) {
            div.classList.add('face-up', colorClass);
        } else {
            div.classList.add('back', 'facedown');
        }

        // 构建牌面内容：正面（暗牌背纹）和背面（明牌内容）
        div.innerHTML = `
            <div class="card-front"></div>
            <div class="card-back ${colorClass}">
                <div class="card-top">
                    <span>${card.rank}</span>
                    <span>${card.suit}</span>
                </div>
                <div class="card-middle">${card.suit}</div>
                <div class="card-bottom">
                    <span>${card.rank}</span>
                    <span>${card.suit}</span>
                </div>
            </div>
        `;

        div.dataset.col = colIdx;
        div.dataset.row = rowIdx;

        // 堆叠偏移
        const offset = rowIdx * 35;
        div.style.top = `${offset}px`;
        div.style.zIndex = rowIdx + 1;

        return div;
    }

    addCardEvents() {
        const cards = document.querySelectorAll('.card');
        
        cards.forEach(card => {
            card.addEventListener('mousedown', (e) => this.onCardMouseDown(e));
            card.addEventListener('mouseenter', (e) => this.onCardMouseEnter(e));
            card.addEventListener('mouseleave', (e) => this.onCardMouseLeave(e));
            // 触摸事件
            card.addEventListener('touchstart', (e) => this.onCardTouchStart(e), { passive: false });
        });

        // 为列容器添加鼠标事件用于检测放置目标
        const columns = document.querySelectorAll('.tableau-column, .k-pile');
        columns.forEach(col => {
            col.addEventListener('mouseenter', (e) => this.onColumnMouseEnter(e));
            col.addEventListener('mouseleave', (e) => this.onColumnMouseLeave(e));
        });

        // 全局鼠标事件用于拖拽
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        // 全局触摸事件
        document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.onTouchEnd(e));
        document.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
    }

    onCardMouseDown(e) {
        if (e.detail > 1) {
            e.preventDefault();
            return;
        }
        if (this.isDragging || this.rafId) return;

        const card = e.target.closest('.card');
        // 排除暗牌（back）以及正在播放翻转动画的牌（revealing）
        if (!card || card.classList.contains('back') || card.classList.contains('revealing')) return;

        const col = parseInt(card.dataset.col);
        const row = parseInt(card.dataset.row);
        
        this.selectedCards = { col, row };
        this.isDragging = true;
        this.dragStartPos = { x: e.clientX, y: e.clientY };
        
        const columnEl = card.closest('.tableau-column, .k-pile');
        this.dragCards = [];
        this.dragCardOffsets = [];
        this.dragOriginalStyles = [];
        
        if (columnEl) {
            const allCards = columnEl.querySelectorAll('.card');
            allCards.forEach((c) => {
                const cardRow = parseInt(c.dataset.row);
                if (cardRow >= row && c.classList.contains('face-up')) {
                    this.dragCards.push(c);
                    
                    const rect = c.getBoundingClientRect();
                    this.dragCardOffsets.push({
                        x: rect.left,
                        y: rect.top
                    });
                    
                    this.dragOriginalStyles.push({
                        top: c.style.top,
                        left: c.style.left,
                        zIndex: c.style.zIndex
                    });
                    
                    c.classList.add('dragging');
                    c.style.position = 'fixed';
                    c.style.margin = '0';
                    c.style.zIndex = 1000 + this.dragCards.length - 1;
                    c.style.pointerEvents = 'none';
                    c.style.transition = 'none';
                    c.style.left = '0';
                    c.style.top = '0';
                    c.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
                }
            });
        }
        
        e.preventDefault();
    }

    onCardTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const mouseEvent = {
            target: e.target,
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => e.preventDefault()
        };
        this.onCardMouseDown(mouseEvent);
    }

    onTouchMove(e) {
        if (!this.isDragging) return;
        if (e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY
        };
        this.onMouseMove(mouseEvent);
    }

    onTouchEnd(e) {
        if (!this.isDragging) return;
        const touch = e.changedTouches[0];
        const mouseEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY
        };
        this.onMouseUp(mouseEvent);
    }

    onMouseMove(e) {
        if (!this.isDragging || !this.dragCards.length) return;
        
        const dx = e.clientX - this.dragStartPos.x;
        const dy = e.clientY - this.dragStartPos.y;
        
        // 1. 更新拖拽牌的位置
        this.dragCards.forEach((card, index) => {
            const offset = this.dragCardOffsets[index];
            const x = offset.x + dx;
            const y = offset.y + dy;
            card.style.transform = `translate(${x}px, ${y}px)`;
        });

        // 2. 实时碰撞检测处理高亮 (仅在提示关闭时需要这种精细检测)
        if (!this.hintEnabled) {
            // 清除当前所有高亮
            document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            this.currentDropTarget = null;

            const firstDragCard = this.dragCards[0];
            const fromCol = this.selectedCards.col;
            const fromRow = this.selectedCards.row;

            // 获取所有潜在的目标牌（各列的最后一张明牌）
            const allPotentialCards = Array.from(document.querySelectorAll('.card.face-up:not(.dragging)'));
            
            // 找出逻辑上为空的列容器（包括只含有提示牌的K槽）
            const allContainers = document.querySelectorAll('.tableau-column, .k-pile');
            allContainers.forEach(col => {
                const tCol = parseInt(col.dataset.col);
                if (this.getPile(tCol).length === 0) {
                    allPotentialCards.push(col);
                }
            });
            
            for (const targetElement of allPotentialCards) {
                const tCol = parseInt(targetElement.dataset.col);
                const isCard = targetElement.classList.contains('card');
                const pile = this.getPile(tCol);

                if (tCol !== fromCol) {
                    let canDrop = false;
                    
                    if (pile.length === 0) {
                        // 目标列逻辑上为空（可能是容器本身，也可能是里面的提示牌）
                        canDrop = this.isValidMove(fromCol, fromRow, tCol);
                    } else if (isCard) {
                        // 目标列有牌，且当前碰撞的是一张真实的牌
                        const tRow = parseInt(targetElement.dataset.row);
                        if (tRow === pile.length - 1) {
                            canDrop = this.isValidMove(fromCol, fromRow, tCol);
                        }
                    }

                    if (canDrop) {
                        if (this.isOverlapping(firstDragCard, targetElement)) {
                            targetElement.classList.add('drop-target');
                            this.currentDropTarget = { col: tCol, row: Math.max(0, pile.length - 1) };
                            break; // 只要找到一个重叠的目标即可
                        }
                    }
                }
            }
        }
    }

    onMouseUp(e) {
        if (!this.isDragging) return;

        if (this.selectedCards) {
            const fromCol = this.selectedCards.col;
            const fromRow = this.selectedCards.row;
            let targetCol = null;

            if (this.hintEnabled) {
                // 提示开启时：维持原有的“落入列区域即触发”的逻辑
                const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
                const targetColEl = elementBelow?.closest('.tableau-column, .k-pile');
                if (targetColEl && targetColEl.hasAttribute('data-col')) targetCol = parseInt(targetColEl.dataset.col);
            } else {
                // 提示关闭时：直接使用实时计算出的碰撞目标
                if (this.currentDropTarget) {
                    targetCol = this.currentDropTarget.col;
                }
            }

            if (targetCol !== null && targetCol !== fromCol) {
                if (this.moveCard(fromCol, fromRow, targetCol)) {
                    this.updateStatus('成功移动');
                } else {
                    this.updateStatus('移动无效');
                }
            }
        }

        this.cleanupDrag();
    }

    cleanupDrag() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        
        if (this.dragCards && this.dragCards.length > 0) {
            const cardsToAnimate = [];
            
            this.dragCards.forEach((card, index) => {
                if (!card || !card.parentNode) return;
                
                const orig = this.dragOriginalStyles[index];
                if (!orig) return;
                
                const columnEl = card.closest('.tableau-column, .k-pile');
                
                if (!columnEl) {
                    card.style.transition = 'none';
                    card.style.transform = 'none';
                    card.classList.remove('dragging');
                    card.style.position = '';
                    card.style.margin = '';
                    card.style.pointerEvents = '';
                    card.style.left = '';
                    card.style.top = orig.top;
                    card.style.zIndex = orig.zIndex;
                    return;
                }
                
                const currentRect = card.getBoundingClientRect();
                const startX = currentRect.left;
                const startY = currentRect.top;
                
                const columnRect = columnEl.getBoundingClientRect();
                const targetTop = parseFloat(orig.top) || 0;
                const targetX = columnRect.left;
                const targetY = columnRect.top + targetTop;
                
                const deltaX = targetX - startX;
                const deltaY = targetY - startY;
                
                cardsToAnimate.push({
                    card,
                    orig,
                    startX,
                    startY,
                    deltaX,
                    deltaY
                });
            });
            
            if (cardsToAnimate.length > 0) {
                const duration = 250;
                const startTime = performance.now();
                
                const animate = (now) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const easeOut = 1 - Math.pow(1 - progress, 3);
                    
                    cardsToAnimate.forEach(({ card, startX, startY, deltaX, deltaY }) => {
                        if (!card || !card.parentNode) return;
                        const x = startX + deltaX * easeOut;
                        const y = startY + deltaY * easeOut;
                        card.style.transform = `translate(${x}px, ${y}px)`;
                    });
                    
                    if (progress < 1) {
                        this.rafId = requestAnimationFrame(animate);
                    } else {
                        cardsToAnimate.forEach(({ card, orig }) => {
                            if (!card || !card.parentNode) return;
                            card.classList.remove('dragging');
                            card.style.transition = 'none';
                            card.style.transform = 'none';
                            card.style.position = '';
                            card.style.margin = '';
                            card.style.pointerEvents = '';
                            card.style.left = '';
                            card.style.top = orig.top;
                            card.style.zIndex = orig.zIndex;
                        });
                        this.rafId = null;
                    }
                };
                
                this.rafId = requestAnimationFrame(animate);
            }
        }
        
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        
        this.isDragging = false;
        this.selectedCards = null;
        this.dragCards = [];
        this.dragCardOffsets = [];
        this.dragOriginalStyles = [];
        this.currentDropTarget = null;
    }

    onCardMouseEnter(e) {
        const card = e.target.closest('.card');
        if (!card || card.classList.contains('back')) return;
        
        // 仅保留非拖拽状态下的“提示”功能
        if (!this.isDragging && this.hintEnabled) {
            this.highlightValidTargets(card);
        }
    }

    onCardMouseLeave(e) {
        // 移除高亮
        document.querySelectorAll('.drop-target').forEach(el => {
            el.classList.remove('drop-target');
        });
        this.currentDropTarget = null;
    }

    onColumnMouseEnter(e) {
        if (!this.isDragging || !this.selectedCards) return;
        
        // --- 修改开始：提示关闭时，直接退出，不处理列容器的高亮 ---
        if (!this.hintEnabled) return;
        // --- 修改结束 ---
        
        const col = e.target.closest('.tableau-column, .k-pile');
        if (!col || !col.hasAttribute('data-col')) return;
        
        const targetCol = parseInt(col.dataset.col);
        if (isNaN(targetCol)) return;
        
        const fromCol = this.selectedCards.col;
        const fromRow = this.selectedCards.row;
        
        // 检查是否是有效移动目标
        if (targetCol !== fromCol && this.isValidMove(fromCol, fromRow, targetCol)) {
            col.classList.add('drop-target');
        }
    }

    onColumnMouseLeave(e) {
        e.target.closest('.tableau-column, .k-pile')?.classList.remove('drop-target');
    }

    highlightValidTargets(card) {
        const col = parseInt(card.dataset.col);
        const row = parseInt(card.dataset.row);
        
        const totalCols = 12;
        
        for (let toCol = 0; toCol < totalCols; toCol++) {
            if (this.isValidMove(col, row, toCol)) {
                const pile = this.getPile(toCol);
                let targetEl;
                
                if (toCol < 2) {
                    targetEl = document.querySelector(`.left-k-piles .k-pile[data-col="${toCol}"]`);
                } else if (toCol < 10) {
                    targetEl = document.querySelector(`.tableau-column[data-col="${toCol}"]`);
                } else {
                    targetEl = document.querySelector(`.right-k-piles .k-pile[data-col="${toCol}"]`);
                }
                
                if (targetEl) {
                    targetEl.classList.add('drop-target');
                }
            }
        }
    }

    highlightValidTargetCard(card) {
        const targetCol = parseInt(card.dataset.col);
        const targetRow = parseInt(card.dataset.row);
        const fromCol = this.selectedCards.col;
        const fromRow = this.selectedCards.row;
        
        // 获取目标列的牌堆
        const pile = this.getPile(targetCol);
        if (!pile || pile.length === 0) return;
        
        // 检查悬停的牌是否是该列的最后一张牌（即可以放置的牌）
        const isLastCard = targetRow === pile.length - 1;
        if (!isLastCard) return;
        
        // 检查是否是有效移动目标
        if (targetCol !== fromCol && this.isValidMove(fromCol, fromRow, targetCol)) {
            // 高亮具体的牌
            card.classList.add('drop-target');
            this.currentDropTarget = { col: targetCol, row: targetRow };
        }
    }

    restart(newMode = null) {
        if (newMode) {
            this.mode = newMode;
        }
        this.deck = this.createDeck();
        this.wastePiles = { '♠': [], '♥': [], '♦': [], '♣': [] };
        this.tableau = [];
        this.leftKPiles = [[], []];
        this.rightKPiles = [[], []];
        this.moveCount = 0;
        this.selectedCards = null;
        this.revealingCards = [];

        document.getElementById('gameBanner').classList.remove('show');
        const canvas = document.getElementById('fireworksCanvas');
        if (canvas) canvas.style.display = 'none';
        
        this.setupGame();
        this.updateMoveCount();
        this.updateStatus('点击并拖动牌到目标位置');
        this.render();
        
        setTimeout(() => {
            this.processAutomaticMoves();
        }, 500);
    }
}

// 检测是否为移动设备
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || ('ontouchstart' in window && window.innerWidth < 1024);
}

// 屏幕方向检测
function checkOrientation() {
    const tip = document.getElementById('orientationTip');
    if (!tip) return;

    const mobile = isMobileDevice();
    const isPortrait = window.innerHeight > window.innerWidth;

    if (mobile && isPortrait) {
        tip.classList.add('show');
        document.body.style.overflow = 'hidden';
    } else {
        tip.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    const game = new SolitaireGame('simple');
    const modeBtn = document.getElementById('modeBtn');
    const modeDropdown = document.getElementById('modeDropdown');
    const modeLinks = modeDropdown.querySelectorAll('a');
    
    // 模式按钮点击事件
    modeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modeDropdown.classList.toggle('show');
    });
    
    // 点击下拉选项
    modeLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const newMode = link.dataset.mode;
            const modeName = link.textContent;
            
            // 更新按钮显示
            modeBtn.innerHTML = `模式: <strong>${modeName}</strong>`;
            modeDropdown.classList.remove('show');
            
            // 重新开始游戏
            game.restart(newMode);
        });
    });
    
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        modeDropdown.classList.remove('show');
    });
    
    document.getElementById('restartBtn').addEventListener('click', () => {
        game.restart();
    });
    
    const bannerBtn = document.getElementById('bannerBtn');
    if (bannerBtn) {
        bannerBtn.addEventListener('click', () => {
            game.restart();
        });
    }
    
    document.getElementById('hintBtn').addEventListener('click', () => {
        game.toggleHint();
    });

    // 日志面板控制
    document.getElementById('logBtn').addEventListener('click', () => {
        document.getElementById('logPanel').style.display = 'block';
    });
    document.getElementById('closeLogBtn').addEventListener('click', () => {
        document.getElementById('logPanel').style.display = 'none';
    });
});