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
        this.leftKPiles = [];
        this.rightKPiles = [];
        this.moveCount = 0;
        this.selectedCards = null;
        this.hintEnabled = false;
        this.isDragging = false;
        this.dragCards = [];
        this.dragCardOffsets = [];
        this.dragOriginalStyles = [];
        this.rafId = null;
        this.currentDropTarget = null; // 当前悬停的目标牌
        this.setupGame();
        this.render();
        this.updateMoveCount();
        this.updateStatus('点击并拖动牌到目标位置');
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

        // 移除K牌
        this.removeKings();
    }

    removeKings() {
        let movedAny = true;
        while (movedAny) {
            movedAny = false;
            for (let col = 0; col < 8; col++) {
                const pile = this.tableau[col];
                const kIndices = [];
                for (let i = 0; i < pile.length; i++) {
                    if (pile[i].faceUp && pile[i].rank === 'K') {
                        kIndices.push(i);
                    }
                }

                if (kIndices.length > 0) {
                    for (let i = kIndices.length - 1; i >= 0; i--) {
                        const startIdx = kIndices[i];
                        const cardsToMove = pile.slice(startIdx);
                        pile.splice(startIdx);

                        // 左右交替放置
                        if ((this.leftKPiles.length + this.rightKPiles.length) % 2 === 0) {
                            this.leftKPiles.push(cardsToMove);
                        } else {
                            this.rightKPiles.push(cardsToMove);
                        }

                        movedAny = true;
                    }
                    this.checkReveal(col);
                }
            }
        }
    }

    checkReveal(colIdx) {
        const pile = this.tableau[colIdx];
        if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
            pile[pile.length - 1].faceUp = true;
            // 如果翻开的是K，继续移除
            if (pile[pile.length - 1].rank === 'K') {
                this.removeKings();
            }
        }
    }

    getPile(colIdx) {
        const leftCount = this.leftKPiles.length;
        if (colIdx < leftCount) {
            return this.leftKPiles[colIdx];
        } else if (colIdx < leftCount + 8) {
            return this.tableau[colIdx - leftCount];
        } else {
            return this.rightKPiles[colIdx - leftCount - 8];
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

        // 目标为空列
        if (toPile.length === 0) {
            if (this.mode === 'hard') return false;
            if (fromPile[fromRow].rank === 'K') return false;
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
        const fromCard = fromPile[fromRow];
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

        // 检查源列是否在主牌桌区域
        const leftCount = this.leftKPiles.length;
        if (fromCol >= leftCount && fromCol < leftCount + 8) {
            this.checkReveal(fromCol - leftCount);
        }

        this.removeKings();
        this.checkCompleteSequence(toCol);
        this.moveCount++;
        this.updateMoveCount();
        this.render();

        // 检查游戏状态
        this.checkGameEnd();

        return true;
    }

    checkCompleteSequence(colIdx) {
        const pile = this.getPile(colIdx);
        if (pile.length < 13) return;

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

                const leftCount = this.leftKPiles.length;
                if (colIdx >= leftCount && colIdx < leftCount + 8) {
                    this.checkReveal(colIdx - leftCount);
                }
                this.removeKings();
                return;
            }
        }
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
            this.showModal(true);
        } else if (this.isGameOver()) {
            this.showModal(false);
        }
    }

    showModal(won) {
        const modal = document.getElementById('gameModal');
        const title = document.getElementById('modalTitle');
        const message = document.getElementById('modalMessage');

        if (won) {
            title.textContent = '🎉 恭喜获胜！';
            message.textContent = `你成功完成了游戏，共用了 ${this.moveCount} 步！`;
            title.classList.add('win-animation');
        } else {
            title.textContent = '游戏结束';
            message.textContent = `没有可移动的牌了，游戏结束。共尝试了 ${this.moveCount} 步。`;
            title.classList.remove('win-animation');
        }

        modal.classList.add('show');
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

        // 渲染左侧K牌堆
        this.leftKPiles.forEach((pile, index) => {
            const div = document.createElement('div');
            div.className = 'k-pile';
            div.dataset.col = index;
            
            pile.forEach((card, rowIdx) => {
                const cardDiv = this.createCardElement(card, index, rowIdx, pile.length);
                div.appendChild(cardDiv);
            });
            
            document.getElementById('leftKPiles').appendChild(div);
        });

        // 渲染主牌桌
        this.tableau.forEach((pile, index) => {
            const div = document.createElement('div');
            div.className = 'tableau-column';
            div.dataset.col = this.leftKPiles.length + index;
            
            pile.forEach((card, rowIdx) => {
                const cardDiv = this.createCardElement(card, this.leftKPiles.length + index, rowIdx, pile.length);
                div.appendChild(cardDiv);
            });
            
            document.getElementById('tableau').appendChild(div);
        });

        // 渲染右侧K牌堆
        this.rightKPiles.forEach((pile, index) => {
            const div = document.createElement('div');
            div.className = 'k-pile';
            div.dataset.col = this.leftKPiles.length + 8 + index;
            
            pile.forEach((card, rowIdx) => {
                const cardDiv = this.createCardElement(card, this.leftKPiles.length + 8 + index, rowIdx, pile.length);
                div.appendChild(cardDiv);
            });
            
            document.getElementById('rightKPiles').appendChild(div);
        });

        // 添加事件监听
        this.addCardEvents();
    }

    createCardElement(card, colIdx, rowIdx, totalRows) {
        const div = document.createElement('div');
        
        // 添加花色颜色类
        const colorClass = card.suit === '♥' || card.suit === '♦' ? 'red' : 'black';
        
        if (card.faceUp) {
            div.className = `card face-up ${colorClass}`;
            div.innerHTML = `
                <div class="card-top">
                    <span>${card.rank}</span>
                    <span>${card.suit}</span>
                </div>
                <div class="card-middle">${card.suit}</div>
                <div class="card-bottom">
                    <span>${card.rank}</span>
                    <span>${card.suit}</span>
                </div>
            `;
        } else {
            div.className = 'card back facedown';
        }
        
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
    }

    onCardMouseDown(e) {
        const card = e.target.closest('.card');
        if (!card || card.classList.contains('back')) return;

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
            const allPotentialCards = document.querySelectorAll('.card.face-up:not(.dragging)');
            
            for (const targetCard of allPotentialCards) {
                const tCol = parseInt(targetCard.dataset.col);
                const tRow = parseInt(targetCard.dataset.row);
                const pile = this.getPile(tCol);

                // 规则校验：必须是目标列的最后一张，且移动合法
                if (pile && tRow === pile.length - 1 && tCol !== fromCol) {
                    if (this.isValidMove(fromCol, fromRow, tCol)) {
                        // 执行碰撞检测
                        if (this.isOverlapping(firstDragCard, targetCard)) {
                            targetCard.classList.add('drop-target');
                            this.currentDropTarget = { col: tCol, row: tRow };
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
                if (targetColEl) targetCol = parseInt(targetColEl.dataset.col);
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
        if (!col) return;
        
        const targetCol = parseInt(col.dataset.col);
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
        
        const totalCols = this.leftKPiles.length + 8 + this.rightKPiles.length;
        
        for (let toCol = 0; toCol < totalCols; toCol++) {
            if (this.isValidMove(col, row, toCol)) {
                const pile = this.getPile(toCol);
                let targetEl;
                
                if (toCol < this.leftKPiles.length) {
                    targetEl = document.querySelectorAll('.left-k-piles .k-pile')[toCol];
                } else if (toCol < this.leftKPiles.length + 8) {
                    targetEl = document.querySelectorAll('.tableau-column')[toCol - this.leftKPiles.length];
                } else {
                    targetEl = document.querySelectorAll('.right-k-piles .k-pile')[toCol - this.leftKPiles.length - 8];
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
        this.leftKPiles = [];
        this.rightKPiles = [];
        this.moveCount = 0;
        this.selectedCards = null;
        
        document.getElementById('gameModal').classList.remove('show');
        this.setupGame();
        this.updateMoveCount();
        this.updateStatus('点击并拖动牌到目标位置');
        this.render();
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
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
    
    document.getElementById('modalBtn').addEventListener('click', () => {
        game.restart();
    });
    
    // 提示按钮点击事件
    document.getElementById('hintBtn').addEventListener('click', () => {
        game.toggleHint();
    });
});