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
    constructor(mode = 'easy') {
        this.mode = mode;
        this.deck = this.createDeck();
        this.wastePiles = { '♠': [], '♥': [], '♦': [], '♣': [] };
        this.tableau = [];
        this.leftKPiles = [[], []];
        this.rightKPiles = [[], []];
        this.moveCount = 0;
        this.hintCount = 0;
        this.selectedCards = null;
        this.isDragging = false;
        this.dragCards = [];
        this.dragOriginalStyles = [];
        this.rafId = null;
        this.currentDropTarget = null; // 当前悬停的目标牌
        this.revealingCards = []; // 记录刚被翻开的牌，用于播放翻转动画
        this.gameLogs = []; // 日志记录
        this.isProcessingAuto = false;
        this._globalEventsBound = false;
        this.currentScale = 1;
        this.autoScale();
        this.setupGame();
        this.bindGlobalEvents(); // 全局事件只绑定一次
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

    // 蜘蛛纸牌风格提示：点击按钮后，检测第一个可移动的牌及目标，高亮闪烁两次
        showHint() {
        if (this.isProcessingAuto || this.isDragging) return;

        const totalCols = 12;
        let moves = [];

        for (let fromCol = 0; fromCol < totalCols; fromCol++) {
            const fromPile = this.getPile(fromCol);
            for (let fromRow = 0; fromRow < fromPile.length; fromRow++) {
                if (!fromPile[fromRow].faceUp) continue;
                for (let toCol = 0; toCol < totalCols; toCol++) {
                    if (fromCol === toCol) continue;
                    if (this.isValidMove(fromCol, fromRow, toCol)) {
                        let score = 0;
                        const card = fromPile[fromRow];
                        const toPile = this.getPile(toCol);
                        
                        // 策略 A: 能够翻开暗牌 (高优先级)
                        if (fromRow > 0 && !fromPile[fromRow - 1].faceUp) score += 100;
                        
                        // 策略 B: 移动到 K 堆 (中高优先级)
                        if (toCol < 2 || toCol >= 10) score += 50;
                        
                        // 策略 C: 形成同花色序列
                        if (toPile.length > 0) {
                            const targetTop = toPile[toPile.length - 1];
                            if (targetTop.suit === card.suit) score += 20;
                        }

                        // 策略 D: 腾空一列 (简单/正常模式)
                        if (fromRow === 0 && fromPile.length > 0) score -= 10; // 尽量不把唯一的列弄空，除非有更好的去处

                        moves.push({ fromCol, fromRow, toCol, score });
                    }
                }
            }
        }

        if (moves.length > 0) {
            // 按分数降序排列
            moves.sort((a, b) => b.score - a.score);
            const best = moves[0];
            this.flashHint(best.fromCol, best.fromRow, best.toCol);
            this.hintCount++;
            this.updateHintCount();
            return;
        }

        this.updateStatus('没有可用的提示移动');
    }

    flashHint(fromCol, fromRow, toCol) {
        // 找到源牌 DOM
        const fromCardEl = document.querySelector(`.card[data-col="${fromCol}"][data-row="${fromRow}"]`);
        
        // 找到目标 DOM（列最后一张牌，或空列容器）
        const toPile = this.getPile(toCol);
        let toEl;
        if (toPile.length > 0) {
            const lastRow = toPile.length - 1;
            toEl = document.querySelector(`.card[data-col="${toCol}"][data-row="${lastRow}"]`);
        } else {
            toEl = document.querySelector(`.tableau-column[data-col="${toCol}"], .k-pile[data-col="${toCol}"]`);
        }

        if (!fromCardEl) return;

        const elements = [fromCardEl];
        if (toEl) elements.push(toEl);

        // 闪烁两次
        let count = 0;
        const maxBlinks = 4; // 2次亮 + 2次灭
        const interval = setInterval(() => {
            if (count % 2 === 0) {
                elements.forEach(el => el.classList.add('hint-flash'));
            } else {
                elements.forEach(el => el.classList.remove('hint-flash'));
            }
            count++;
            if (count >= maxBlinks) {
                clearInterval(interval);
                elements.forEach(el => el.classList.remove('hint-flash'));
            }
        }, 300);

        const fromCard = this.getPile(fromCol)[fromRow];
        this.updateStatus(`提示: 移动 ${fromCard.suit}${fromCard.rank} 到列 ${toCol}`);
    }

    updateHintCount() {
        const el = document.getElementById('hintCount');
        if (el) el.textContent = this.hintCount;
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
    }

    async processAutomaticMoves(targetCol = null) {
        if (this.isProcessingAuto) return;
        this.isProcessingAuto = true;
        this.logAction('[DEBUG] 开始自动处理流程...');

        try {
            let changed = true;
            let loopCount = 0;
            while (changed) {
                loopCount++;
                changed = false;
                this.logAction(`[DEBUG] 自动处理轮次: ${loopCount}`);

                const hasRevealing = this.revealingCards.length > 0;
                this.render(); // 渲染任何已有的逻辑变更
                
                if (hasRevealing) {
                    this.logAction('[DEBUG] 等待翻牌动画...');
                    await new Promise(resolve => setTimeout(resolve, 650));
                }

                const kingsToMove = [];
                for (let col = 0; col < 8; col++) {
                    const pile = this.tableau[col];
                    for (let i = 0; i < pile.length; i++) {
                        if (pile[i].faceUp && pile[i].rank === 'K' && pile[i].autoMoveToK) {
                            kingsToMove.push({ col, startIdx: i, card: pile[i] });
                            pile[i].autoMoveToK = false;
                            break; 
                        }
                    }
                }

                if (kingsToMove.length > 0) {
                    const flyingPromises = kingsToMove.map(async ({ col, startIdx, card }) => {
                        const pile = this.tableau[col];
                        const cardsToMove = pile.slice(startIdx);
                        let targetColPos = 0;
                        if (card.suit === '♠') targetColPos = 0;
                        else if (card.suit === '♥') targetColPos = 1;
                        else if (card.suit === '♣') targetColPos = 10;
                        else if (card.suit === '♦') targetColPos = 11;
                        
                        let targetPileStr = targetColPos < 2 ? '左侧K堆' : '右侧K堆';
                        let isLeft = targetColPos < 2;

                        const flyingCards = [];
                        const columnEl = document.querySelector(`.tableau-column[data-col="${2 + col}"]`);
                        if (columnEl) {
                            const allCards = Array.from(columnEl.querySelectorAll('.card'));
                            allCards.forEach(c => {
                                if (parseInt(c.dataset.row) >= startIdx) {
                                    flyingCards.push(c);
                                }
                            });
                        }

                        pile.splice(startIdx);
                        if (isLeft) {
                            this.leftKPiles[targetColPos].push(...cardsToMove);
                        } else {
                            this.rightKPiles[targetColPos - 10].push(...cardsToMove);
                        }
                        this.logAction(`K牌自动移出: 从列[${col}]移至${targetPileStr}槽位[${targetColPos}] (携带 ${cardsToMove.length} 张牌)`);

                        if (flyingCards.length > 0) {
                            let slotEl;
                            if (isLeft) {
                                slotEl = document.querySelectorAll('#leftKPiles .k-pile')[targetColPos];
                            } else {
                                slotEl = document.querySelectorAll('#rightKPiles .k-pile')[targetColPos - 10];
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
                                    cardEl.style.opacity = '0';
                                });
                                clones[0].getBoundingClientRect(); 
                                clones.forEach((clone, idx) => {
                                    clone.style.left = baseRect.left + 'px';
                                    clone.style.top = (baseRect.top + idx * 35) + 'px';
                                });
                                await new Promise(resolve => setTimeout(resolve, 400));
                                clones.forEach(c => c.remove());
                            }
                        }
                        this.checkReveal(col, true);
                        changed = true;
                    });
                    await Promise.all(flyingPromises);
                    continue;
                }

                if (targetCol !== null && await this.checkCompleteSequenceData(targetCol)) {
                    this.logAction(`[DEBUG] 检测到目标列 ${targetCol} 完成序列`);
                    changed = true;
                    targetCol = null;
                    continue;
                }
                for (let c = 0; c < 12; c++) {
                    if (await this.checkCompleteSequenceData(c)) {
                        this.logAction(`[DEBUG] 检测到列 ${c} 完成序列`);
                        changed = true;
                        break;
                    }
                }
            }
            this.render();
            this.checkGameEnd();
            this.logAction('[DEBUG] 自动处理流程结束');
        } catch (err) {
            this.logAction(`[ERROR] 自动处理异常: ${err.message}`);
        } finally {
            this.isProcessingAuto = false;
        }
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
        if (colIdx < 2) return this.leftKPiles[colIdx];
        else if (colIdx < 10) return this.tableau[colIdx - 2];
        else return this.rightKPiles[colIdx - 10];
    }

    isValidMove(fromCol, fromRow, toCol) {
        if (fromCol === toCol) return false;
        const fromPile = this.getPile(fromCol);
        const toPile = this.getPile(toCol);
        if (fromRow < 0 || fromRow >= fromPile.length) return false;
        if (!fromPile[fromRow].faceUp) return false;
        const fromCard = fromPile[fromRow];

        if (toCol < 2 || toCol >= 10) {
            if (toPile.length === 0) {
                if (fromCard.rank !== 'K') return false;
                const targetSuit = toCol === 0 ? '♠' : toCol === 1 ? '♥' : toCol === 10 ? '♣' : '♦';
                return fromCard.suit === targetSuit;
            }
        }

        if (toPile.length === 0) {
            if (this.mode === 'hard') return false;
            if (fromCard.rank === 'K') return false;
            if (this.mode === 'normal') {
                const cardsToMove = fromPile.slice(fromRow);
                for (let i = 0; i < cardsToMove.length - 1; i++) {
                    if (cardsToMove[i].suit !== cardsToMove[i + 1].suit) return false;
                    if (cardsToMove[i + 1].getRankValue() !== cardsToMove[i].getRankValue() - 1) return false;
                }
            }
            return true;
        }
        const toCard = toPile[toPile.length - 1];
        return fromCard.suit === toCard.suit && fromCard.getRankValue() === toCard.getRankValue() - 1;
    }

    moveCard(fromCol, fromRow, toCol) {
        if (!this.isValidMove(fromCol, fromRow, toCol)) return false;
        const fromPile = this.getPile(fromCol);
        const toPile = this.getPile(toCol);
        const cardsToMove = fromPile.slice(fromRow);
        toPile.push(...cardsToMove);
        fromPile.splice(fromRow);
        this.logAction(`移动牌: 从列[${fromCol}] (row ${fromRow}) 到列[${toCol}], 牌为 ${cardsToMove[0].suit}${cardsToMove[0].rank} 等 ${cardsToMove.length} 张`);
        if (fromCol >= 2 && fromCol < 10) this.checkReveal(fromCol - 2, true);
        this.moveCount++;
        this.updateMoveCount();
        this.processAutomaticMoves(toCol);
        return true;
    }

    async checkCompleteSequenceData(colIdx) {
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
                
                let columnSelector = '';
                if (colIdx < 2) columnSelector = `#leftKPiles .k-pile[data-col="${colIdx}"]`;
                else if (colIdx < 10) columnSelector = `.tableau-column[data-col="${colIdx}"]`;
                else columnSelector = `#rightKPiles .k-pile[data-col="${colIdx}"]`;
                
                const columnEl = document.querySelector(columnSelector);
                if (columnEl) {
                    const cardEls = Array.from(columnEl.querySelectorAll('.card'));
                    const seqEls = cardEls.slice(i, i + 13);
                    
                    if (seqEls.length === 13) {
                        const suitIdx = SUITS.indexOf(suit);
                        const foundationPile = document.querySelectorAll('.foundation-pile')[suitIdx];
                        
                        if (foundationPile) {
                            const fRect = foundationPile.getBoundingClientRect();
                            const startRects = seqEls.map(el => el.getBoundingClientRect());
                            const kRect = startRects[0];
                            const transforms = [];
                            
                            seqEls.forEach(el => {
                                el.style.transition = 'filter 0.3s';
                                el.style.filter = 'brightness(1.5) drop-shadow(0 0 10px gold)';
                            });
                            await new Promise(r => setTimeout(r, 300));
                            seqEls.forEach(el => { el.style.filter = ''; });
                            
                            for (let j = 0; j < 13; j++) {
                                const el = seqEls[j];
                                const elRect = startRects[j];
                                const dy = (kRect.top - elRect.top) / this.currentScale;
                                const dx = (kRect.left - elRect.left) / this.currentScale;
                                transforms.push({ dx, dy });
                                
                                el.style.zIndex = 6000 + j;
                                if (j > 0) {
                                    el.style.transition = 'transform 0.12s ease-out';
                                    el.style.transform = `translate(${dx}px, ${dy}px)`;
                                    await new Promise(r => setTimeout(r, 60));
                                }
                            }
                            await new Promise(r => setTimeout(r, 150));
                            
                            const fDx = (fRect.left - kRect.left) / this.currentScale;
                            const fDy = (fRect.top - kRect.top) / this.currentScale;
                            
                            seqEls.forEach((el, j) => {
                                el.style.transition = 'all 0.5s ease-in-out';
                                const totalDx = transforms[j].dx + fDx;
                                const totalDy = transforms[j].dy + fDy;
                                el.style.transform = `translate(${totalDx}px, ${totalDy}px) scale(0.5)`;
                                el.style.opacity = '0';
                            });
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                }

                this.wastePiles[suit] = subPile.slice();
                pile.splice(i, 13);
                this.logAction(`完成一条完整的序列: ${suit} A-K，已移入目标花色堆`);
                if (colIdx >= 2 && colIdx < 10) this.checkReveal(colIdx - 2, true);
                return true;
            }
        }
        return false;
    }

    isGameWon() {
        return SUITS.every(suit => this.wastePiles[suit].length === 13);
    }

    isGameOver() {
        const totalCols = 12;
        for (let fromCol = 0; fromCol < totalCols; fromCol++) {
            const fromPile = this.getPile(fromCol);
            for (let fromRow = 0; fromRow < fromPile.length; fromRow++) {
                if (!fromPile[fromRow].faceUp) continue;
                for (let toCol = 0; toCol < totalCols; toCol++) {
                    if (fromCol !== toCol && this.isValidMove(fromCol, fromRow, toCol)) return false;
                }
            }
        }
        return true;
    }

    isOverlapping(el1, el2) {
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();
        return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom);
    }

    checkGameEnd() {
        if (this.isGameWon()) this.showBanner(true);
        else if (this.isGameOver()) this.showBanner(false);
    }

    showBanner(won) {
        const banner = document.getElementById('gameBanner');
        const title = document.getElementById('bannerTitle');
        const message = document.getElementById('bannerMessage');
        if (won) {
            title.textContent = '🎉 恭喜获胜！';
            message.textContent = `你成功完成了游戏，共用了 ${this.moveCount} 步！`;
            title.classList.add('win-animation');
            this.playFireworks();
        } else {
            title.textContent = '没有可用移动了';
            message.textContent = `已进入死局。共尝试了 ${this.moveCount} 步。`;
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
                x: canvas.width / 2, y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15,
                size: Math.random() * 5 + 2, color: colors[Math.floor(Math.random() * colors.length)],
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
                    ctx.arc(p.x, p.y, p.size, 0, 3.14159 * 2);
                    ctx.fillStyle = p.color;
                    ctx.fill();
                    p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.01;
                }
            }
            if (active) requestAnimationFrame(animate);
            else canvas.style.display = 'none';
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
                pile.innerHTML = `<div class="card face-up ${colorClass}" style="position: static;"><div class="card-front"></div><div class="card-back ${colorClass}"><div class="card-top"><span>${topCard.rank}</span><span>${topCard.suit}</span></div><div class="card-middle">${topCard.suit}</div><div class="card-bottom"><span>${topCard.rank}</span><span>${topCard.suit}</span></div></div></div>`;
                pile.style.border = '2px solid #ffd700';
            } else {
                pile.innerHTML = `<div class="card back" style="position: static; opacity: 0.3;"></div>`;
                pile.style.border = '2px dashed rgba(255,255,255,0.3)';
            }
        });
    }

    renderTableau() {
        document.getElementById('leftKPiles').innerHTML = '';
        document.getElementById('tableau').innerHTML = '';
        document.getElementById('rightKPiles').innerHTML = '';
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
                    cardDiv.classList.add('placeholder'); cardDiv.style.opacity = '0.35';
                    cardDiv.style.position = 'static';
                    cardDiv.style.pointerEvents = 'none';
                    div.appendChild(cardDiv);
                }
                div.style.border = '2px dashed rgba(255,255,255,0.3)';
            }
            document.getElementById('leftKPiles').appendChild(div);
        }
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
                    cardDiv.classList.add('placeholder'); cardDiv.style.opacity = '0.35';
                    cardDiv.style.position = 'static';
                    cardDiv.style.pointerEvents = 'none';
                    div.appendChild(cardDiv);
                }
                div.style.border = '2px dashed rgba(255,255,255,0.3)';
            }
            document.getElementById('rightKPiles').appendChild(div);
        }
        this.updateBoardHeight();
        this.addCardEvents();
    }

    updateBoardHeight() {
        let maxCards = 0;
        const all_piles = this.leftKPiles.concat(this.tableau, this.rightKPiles);
        for (let p of all_piles) maxCards = Math.max(maxCards, p.length);
        const requiredHeight = maxCards > 0 ? (maxCards - 1) * 35 + 96 + 20 : 0;
        const finalHeight = Math.max(900, requiredHeight);
        document.querySelectorAll('.tableau-column, .k-pile, .tableau, .k-piles').forEach(c => c.style.minHeight = finalHeight + 'px');
    }

    createCardElement(card, colIdx, rowIdx, totalRows) {
        const div = document.createElement('div');
        const isRevealing = this.revealingCards.includes(card);
        const colorClass = card.suit === '♥' || card.suit === '♦' ? 'red' : 'black';
        div.className = 'card';
        if (isRevealing) {
            div.classList.add('back', 'facedown', 'revealing', colorClass);
            div.addEventListener('animationend', () => {
                div.classList.remove('back', 'facedown', 'revealing');
                div.classList.add('face-up', colorClass);
            }, { once: true });
        } else if (card.faceUp) div.classList.add('face-up', colorClass);
        else div.classList.add('back', 'facedown');
        div.innerHTML = `<div class="card-front"></div><div class="card-back ${colorClass}"><div class="card-top"><span>${card.rank}</span><span>${card.suit}</span></div><div class="card-middle">${card.suit}</div><div class="card-bottom"><span>${card.rank}</span><span>${card.suit}</span></div></div>`;
        div.dataset.col = colIdx;
        div.dataset.row = rowIdx;
        div.style.top = `${rowIdx * 35}px`;
        div.style.zIndex = rowIdx + 1;
        return div;
    }

    bindGlobalEvents() {
        if (this._globalEventsBound) return;
        this._globalEventsBound = true;
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.onTouchEnd(e));
        document.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
        window.addEventListener('resize', () => this.autoScale());
    }

    autoScale() {
        const container = document.querySelector('.game-container');
        if (!container) return;
        const targetWidth = 1080;
        const currentWidth = window.innerWidth;
        if (currentWidth < targetWidth) {
            this.currentScale = currentWidth / targetWidth;
            container.style.transform = `scale(${this.currentScale})`;
            container.style.transformOrigin = 'top center';
        } else {
            this.currentScale = 1;
            container.style.transform = `scale(1)`;
            container.style.transformOrigin = 'top center';
        }
    }

    addCardEvents() {
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('mousedown', (e) => this.onCardMouseDown(e));
            card.addEventListener('touchstart', (e) => this.onCardTouchStart(e), { passive: false });
        });
    }

    onCardMouseDown(e) {
        if (this.isProcessingAuto) {
            this.logAction('[DEBUG] 自动处理中，屏蔽手动操作');
            return;
        }
        if (e.detail > 1 || this.isDragging || this.rafId) return;
        const card = e.target.closest('.card');
        if (!card || card.classList.contains('back') || card.classList.contains('revealing')) return;
        const col = parseInt(card.dataset.col);
        const row = parseInt(card.dataset.row);
        this.selectedCards = { 'col': col, 'row': row };
        this.isDragging = true;
        this.dragStartPos = { 'x': e.clientX, 'y': e.clientY };
        const columnEl = card.closest('.tableau-column, .k-pile');
        this.dragCards = []; this.dragOriginalStyles = [];
        if (columnEl) {
            columnEl.querySelectorAll('.card').forEach((c) => {
                const cardRow = parseInt(c.dataset.row);
                if (cardRow >= row && c.classList.contains('face-up')) {
                    this.dragCards.push(c);
                    this.dragOriginalStyles.push({ 'top': c.style.top, 'left': c.style.left, 'zIndex': c.style.zIndex });
                    c.classList.add('dragging');
                    c.style.zIndex = 1000 + this.dragCards.length - 1;
                    c.style.pointerEvents = 'none'; c.style.transition = 'none';
                    c.style.transform = `translate(0px, 0px)`;
                }
            });
        }
        e.preventDefault();
    }

    onCardTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        this.onCardMouseDown({
            target: e.target, clientX: touch.clientX, clientY: touch.clientY,
            preventDefault: () => e.preventDefault(), detail: 1
        });
    }

    onTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }

    onTouchEnd(e) {
        if (!this.isDragging) return;
        const touch = e.changedTouches[0];
        this.onMouseUp({ clientX: touch.clientX, clientY: touch.clientY });
    }

    onMouseMove(e) {
        if (!this.isDragging || !this.dragCards.length) return;
        const dx = (e.clientX - this.dragStartPos.x) / this.currentScale;
        const dy = (e.clientY - this.dragStartPos.y) / this.currentScale;
        this.dragCards.forEach((card) => {
            card.style.transform = `translate(${dx}px, ${dy}px)`;
        });

        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        this.currentDropTarget = null;
        const firstDragCard = this.dragCards[0];
        const fromCol = this.selectedCards.col;
        const fromRow = this.selectedCards.row;
        const allPotentialCards = Array.from(document.querySelectorAll('.card.face-up:not(.dragging):not(.placeholder)'));
        document.querySelectorAll('.tableau-column, .k-pile').forEach(col => {
            const tCol = parseInt(col.dataset.col);
            if (this.getPile(tCol).length === 0) allPotentialCards.push(col);
        });
        
        for (const targetElement of allPotentialCards) {
            const tCol = parseInt(targetElement.dataset.col);
            if (isNaN(tCol)) continue;
            const isCard = targetElement.classList.contains('card');
            const pile = this.getPile(tCol);
            if (tCol !== fromCol) {
                let canDrop = false;
                if (pile.length === 0) canDrop = this.isValidMove(fromCol, fromRow, tCol);
                else if (isCard) {
                    if (parseInt(targetElement.dataset.row) === pile.length - 1) {
                        canDrop = this.isValidMove(fromCol, fromRow, tCol);
                    }
                }
                if (canDrop && this.isOverlapping(firstDragCard, targetElement)) {
                    targetElement.classList.add('drop-target');
                    this.currentDropTarget = { 'col': tCol, 'row': Math.max(0, pile.length - 1) };
                    break;
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
            if (this.currentDropTarget) targetCol = this.currentDropTarget.col;
            if (targetCol !== null && targetCol !== fromCol) {
                if (!this.moveCard(fromCol, fromRow, targetCol)) {
                    this.updateStatus('移动无效');
                    this.logAction(`[DEBUG] 移动失败: 从列 ${fromCol} 到列 ${targetCol} 不符合规则`);
                }
            }
        }
        this.cleanupDrag();
    }

    cleanupDrag() {
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        
        if (this.dragCards && this.dragCards.length > 0) {
            this.dragCards.forEach((card, index) => {
                const orig = this.dragOriginalStyles[index];
                
                card.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
                card.style.transform = 'translate(0px, 0px)';
                
                const cleanupCard = () => {
                    if (document.body.contains(card)) {
                        card.classList.remove('dragging');
                        card.style.transition = '';
                        card.style.transform = '';
                        card.style.pointerEvents = '';
                        if (orig) card.style.zIndex = orig.zIndex;
                    }
                };

                const transitionHandler = (e) => {
                    if (e.propertyName === 'transform') {
                        card.removeEventListener('transitionend', transitionHandler);
                        cleanupCard();
                    }
                };
                
                card.addEventListener('transitionend', transitionHandler);
                setTimeout(() => {
                    card.removeEventListener('transitionend', transitionHandler);
                    cleanupCard();
                }, 300);
            });
        }
        
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        this.isDragging = false; 
        this.selectedCards = null; 
        this.dragCards = []; 
        this.dragOriginalStyles = [];
        this.currentDropTarget = null;
    }

    restart(newMode = null) {
        if (newMode) this.mode = newMode;
        this.deck = this.createDeck();
        this.wastePiles = { '♠': [], '♥': [], '♦': [], '♣': [] };
        this.tableau = []; this.leftKPiles = [[], []]; this.rightKPiles = [[], []];
        this.moveCount = 0; this.hintCount = 0; this.selectedCards = null; this.revealingCards = [];
        this.isProcessingAuto = false; this.gameLogs = [];
        const logContainer = document.getElementById('gameLogContent');
        if (logContainer) logContainer.innerHTML = '';
        document.getElementById('gameBanner').classList.remove('show');
        const canvas = document.getElementById('fireworksCanvas');
        if (canvas) canvas.style.display = 'none';
        this.setupGame();
        this.updateMoveCount(); this.updateHintCount();
        this.updateStatus('点击并拖动牌到目标位置');
        this.render();
        setTimeout(() => this.processAutomaticMoves(), 500);
    }
}

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth < 1024);
}

function checkOrientation() {
    const tip = document.getElementById('orientationTip');
    if (!tip) return;
    if (isMobileDevice() && window.innerHeight > window.innerWidth) {
        tip.classList.add('show'); document.body.style.overflow = 'hidden';
    } else {
        tip.classList.remove('show'); document.body.style.overflow = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    const game = new SolitaireGame('easy');
    const modeBtn = document.getElementById('modeBtn');
    const modeDropdown = document.getElementById('modeDropdown');
    modeBtn.addEventListener('click', (e) => { e.stopPropagation(); modeDropdown.classList.toggle('show'); });
    modeDropdown.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const newMode = link.dataset.mode;
            modeBtn.innerHTML = `模式: <strong>${link.textContent}</strong>`;
            modeDropdown.classList.remove('show');
            game.restart(newMode);
        });
    });
    document.addEventListener('click', () => modeDropdown.classList.remove('show'));
    document.getElementById('restartBtn').addEventListener('click', () => game.restart());
    document.getElementById('bannerBtn')?.addEventListener('click', () => game.restart());
    document.getElementById('hintBtn').addEventListener('click', () => game.showHint());
    document.getElementById('logBtn').addEventListener('click', () => { document.getElementById('logPanel').style.display = 'block'; });
    document.getElementById('closeLogBtn').addEventListener('click', () => { document.getElementById('logPanel').style.display = 'none'; });
});