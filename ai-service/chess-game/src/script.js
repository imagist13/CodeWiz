class ChessGame {
    constructor() {
        this.board = this.initializeBoard();
        this.currentPlayer = 'red'; // red or black
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameStatus = 'playing'; // playing or finished
        this.initializeGame();
    }

    initializeBoard() {
        // 创建一个 10x9 的棋盘
        const board = Array(10).fill().map(() => Array(9).fill(null));
        
        // 初始化红方棋子
        board[9][0] = { type: '车', color: 'red', symbol: '车' };
        board[9][1] = { type: '马', color: 'red', symbol: '马' };
        board[9][2] = { type: '象', color: 'red', symbol: '象' };
        board[9][3] = { type: '士', color: 'red', symbol: '士' };
        board[9][4] = { type: '将', color: 'red', symbol: '帅' };
        board[9][5] = { type: '士', color: 'red', symbol: '士' };
        board[9][6] = { type: '象', color: 'red', symbol: '象' };
        board[9][7] = { type: '马', color: 'red', symbol: '马' };
        board[9][8] = { type: '车', color: 'red', symbol: '车' };
        board[6][1] = { type: '炮', color: 'red', symbol: '炮' };
        board[6][7] = { type: '炮', color: 'red', symbol: '炮' };
        board[7][0] = { type: '兵', color: 'red', symbol: '兵' };
        board[7][2] = { type: '兵', color: 'red', symbol: '兵' };
        board[7][4] = { type: '兵', color: 'red', symbol: '兵' };
        board[7][6] = { type: '兵', color: 'red', symbol: '兵' };
        board[7][8] = { type: '兵', color: 'red', symbol: '兵' };

        // 初始化黑方棋子
        board[0][0] = { type: '车', color: 'black', symbol: '车' };
        board[0][1] = { type: '马', color: 'black', symbol: '马' };
        board[0][2] = { type: '象', color: 'black', symbol: '象' };
        board[0][3] = { type: '士', color: 'black', symbol: '士' };
        board[0][4] = { type: '将', color: 'black', symbol: '将' };
        board[0][5] = { type: '士', color: 'black', symbol: '士' };
        board[0][6] = { type: '象', color: 'black', symbol: '象' };
        board[0][7] = { type: '马', color: 'black', symbol: '马' };
        board[0][8] = { type: '车', color: 'black', symbol: '车' };
        board[3][1] = { type: '炮', color: 'black', symbol: '炮' };
        board[3][7] = { type: '炮', color: 'black', symbol: '炮' };
        board[2][0] = { type: '兵', color: 'black', symbol: '卒' };
        board[2][2] = { type: '兵', color: 'black', symbol: '卒' };
        board[2][4] = { type: '兵', color: 'black', symbol: '卒' };
        board[2][6] = { type: '兵', color: 'black', symbol: '卒' };
        board[2][8] = { type: '兵', color: 'black', symbol: '卒' };

        return board;
    }

    initializeGame() {
        this.renderBoard();
        this.updatePlayerDisplay();
        this.setupEventListeners();
    }

    renderBoard() {
        const boardElement = document.getElementById('chessboard');
        boardElement.innerHTML = '';

        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                cell.dataset.row = row;
                cell.dataset.col = col;

                const piece = this.board[row][col];
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.className = `piece ${piece.color}`;
                    pieceElement.textContent = piece.symbol;
                    pieceElement.dataset.type = piece.type;
                    pieceElement.dataset.color = piece.color;
                    cell.appendChild(pieceElement);
                }

                boardElement.appendChild(cell);
            }
        }
    }

    updatePlayerDisplay() {
        document.getElementById('current-player').textContent = this.currentPlayer === 'red' ? '红方' : '黑方';
    }

    setupEventListeners() {
        document.getElementById('chessboard').addEventListener('click', (e) => {
            if (this.gameStatus !== 'playing') return;
            
            const cell = e.target.closest('.cell');
            if (!cell) return;

            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);

            this.handleCellClick(row, col);
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetGame();
        });
    }

    handleCellClick(row, col) {
        const piece = this.board[row][col];

        // 如果点击的是己方棋子
        if (piece && piece.color === this.currentPlayer) {
            this.selectPiece(row, col);
            return;
        }

        // 如果已经选择了棋子，尝试移动
        if (this.selectedPiece) {
            this.movePiece(row, col);
        }
    }

    selectPiece(row, col) {
        // 取消之前的选择
        this.clearSelection();
        
        // 选择新棋子
        this.selectedPiece = { row, col };
        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        cell.classList.add('selected');

        // 计算并显示有效移动位置
        this.validMoves = this.calculateValidMoves(row, col);
        this.validMoves.forEach(move => {
            const moveCell = document.querySelector(`.cell[data-row="${move.row}"][data-col="${move.col}"]`);
            if (moveCell) {
                moveCell.classList.add('valid-move');
            }
        });
    }

    clearSelection() {
        // 清除之前的选择
        document.querySelectorAll('.cell.selected').forEach(cell => {
            cell.classList.remove('selected');
        });
        document.querySelectorAll('.cell.valid-move').forEach(cell => {
            cell.classList.remove('valid-move');
        });
        this.selectedPiece = null;
        this.validMoves = [];
    }

    calculateValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];

        const moves = [];

        // 简化的移动规则（仅实现基本规则）
        switch (piece.type) {
            case '将':
            case '帅':
                this.calculateKingMoves(row, col, moves);
                break;
            case '士':
                this.calculateAdvisorMoves(row, col, moves);
                break;
            case '象':
            case '相':
                this.calculateElephantMoves(row, col, moves);
                break;
            case '马':
                this.calculateHorseMoves(row, col, moves);
                break;
            case '车':
                this.calculateChariotMoves(row, col, moves);
                break;
            case '炮':
                this.calculateCannonMoves(row, col, moves);
                break;
            case '兵':
            case '卒':
                this.calculatePawnMoves(row, col, moves);
                break;
        }

        return moves;
    }

    calculateKingMoves(row, col, moves) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const palace = this.currentPlayer === 'red' ? [[7, 3], [7, 4], [7, 5], [8, 3], [8, 4], [8, 5], [9, 3], [9, 4], [9, 5]] : [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]];
        
        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (this.isValidPosition(newRow, newCol) && 
                palace.some(pos => pos[0] === newRow && pos[1] === newCol)) {
                const targetPiece = this.board[newRow][newCol];
                if (!targetPiece || targetPiece.color !== this.currentPlayer) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }
    }

    calculateAdvisorMoves(row, col, moves) {
        const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        const palace = this.currentPlayer === 'red' ? [[7, 3], [7, 5], [8, 4], [9, 3], [9, 5]] : [[0, 3], [0, 5], [1, 4], [2, 3], [2, 5]];
        
        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (this.isValidPosition(newRow, newCol) && 
                palace.some(pos => pos[0] === newRow && pos[1] === newCol)) {
                const targetPiece = this.board[newRow][newCol];
                if (!targetPiece || targetPiece.color !== this.currentPlayer) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }
    }

    calculateElephantMoves(row, col, moves) {
        const directions = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
        const river = this.currentPlayer === 'red' ? 4 : 5;
        
        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            // 象眼不能被堵
            const eyeRow = row + dr / 2;
            const eyeCol = col + dc / 2;
            
            if (this.isValidPosition(newRow, newCol) && 
                this.isValidPosition(eyeRow, eyeCol) &&
                this.board[eyeRow][eyeCol] === null &&
                newRow >= river && newRow <= 9 - river) {
                const targetPiece = this.board[newRow][newCol];
                if (!targetPiece || targetPiece.color !== this.currentPlayer) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }
    }

    calculateHorseMoves(row, col, moves) {
        const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        
        for (const [dr, dc] of jumps) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            // 马腿不能被堵
            const legRow = row + (dr / 2);
            const legCol = col + (dc / 2);
            
            if (this.isValidPosition(newRow, newCol) && 
                this.isValidPosition(legRow, legCol) &&
                this.board[legRow][legCol] === null) {
                const targetPiece = this.board[newRow][newCol];
                if (!targetPiece || targetPiece.color !== this.currentPlayer) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }
    }

    calculateChariotMoves(row, col, moves) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        
        for (const [dr, dc] of directions) {
            let newRow = row + dr;
            let newCol = col + dc;
            
            while (this.isValidPosition(newRow, newCol)) {
                const targetPiece = this.board[newRow][newCol];
                if (!targetPiece) {
                    moves.push({ row: newRow, col: newCol });
                } else {
                    if (targetPiece.color !== this.currentPlayer) {
                        moves.push({ row: newRow, col: newCol });
                    }
                    break;
                }
                newRow += dr;
                newCol += dc;
            }
        }
    }

    calculateCannonMoves(row, col, moves) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        
        for (const [dr, dc] of directions) {
            let newRow = row + dr;
            let newCol = col + dc;
            let hasJumped = false;
            
            while (this.isValidPosition(newRow, newCol)) {
                const targetPiece = this.board[newRow][newCol];
                if (!targetPiece && !hasJumped) {
                    moves.push({ row: newRow, col: newCol });
                } else if (targetPiece && !hasJumped) {
                    hasJumped = true;
                } else if (targetPiece && hasJumped) {
                    if (targetPiece.color !== this.currentPlayer) {
                        moves.push({ row: newRow, col: newCol });
                    }
                    break;
                } else if (!targetPiece && hasJumped) {
                    moves.push({ row: newRow, col: newCol });
                }
                newRow += dr;
                newCol += dc;
            }
        }
    }

    calculatePawnMoves(row, col, moves) {
        const direction = this.currentPlayer === 'red' ? -1 : 1;
        const startRow = this.currentPlayer === 'red' ? 6 : 3;
        
        // 前进
        const newRow = row + direction;
        if (this.isValidPosition(newRow, col)) {
            const targetPiece = this.board[newRow][col];
            if (!targetPiece) {
                moves.push({ row: newRow, col: col });
            }
        }
        
        // 过河后可以左右移动
        if ((this.currentPlayer === 'red' && row <= 4) || (this.currentPlayer === 'black' && row >= 5)) {
            const directions = [[0, -1], [0, 1]];
            for (const [dr, dc] of directions) {
                const newRow = row + dr;
                const newCol = col + dc;
                if (this.isValidPosition(newRow, newCol)) {
                    const targetPiece = this.board[newRow][newCol];
                    if (!targetPiece || targetPiece.color !== this.currentPlayer) {
                        moves.push({ row: newRow, col: newCol });
                    }
                }
            }
        }
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 10 && col >= 0 && col < 9;
    }

    movePiece(toRow, toCol) {
        if (!this.selectedPiece) return;

        const fromRow = this.selectedPiece.row;
        const fromCol = this.selectedPiece.col;
        const piece = this.board[fromRow][fromCol];

        // 检查是否是有效移动
        const isValidMove = this.validMoves.some(move => move.row === toRow && move.col === toCol);
        if (!isValidMove) {
            this.clearSelection();
            return;
        }

        // 执行移动
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        // 检查是否吃掉对方将/帅
        const targetPiece = this.board[toRow][toCol];
        if (targetPiece && (targetPiece.type === '将' || targetPiece.type === '帅')) {
            this.gameStatus = 'finished';
            document.getElementById('game-status').textContent = `${this.currentPlayer === 'red' ? '红方' : '黑方'}获胜！`;
        }

        // 切换玩家
        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        
        // 重新渲染
        this.renderBoard();
        this.updatePlayerDisplay();
        this.clearSelection();
    }

    resetGame() {
        this.board = this.initializeBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameStatus = 'playing';
        this.renderBoard();
        this.updatePlayerDisplay();
        document.getElementById('game-status').textContent = '游戏开始';
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    new ChessGame();
});