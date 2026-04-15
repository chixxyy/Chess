"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_FEN = void 0;
exports.parseFEN = parseFEN;
exports.generateFEN = generateFEN;
const types_1 = require("./types");
exports.INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';
function charToPiece(char) {
    if (char >= '1' && char <= '9')
        return null;
    const isRed = char === char.toUpperCase();
    const type = char.toLowerCase();
    return {
        type,
        camp: isRed ? types_1.Camp.RED : types_1.Camp.BLACK
    };
}
function parseFEN(fen) {
    const board = Array.from({ length: 10 }, () => Array(9).fill(null));
    const [position] = fen.split(' ');
    const rows = position.split('/');
    for (let y = 0; y < 10; y++) {
        let x = 0;
        for (const char of rows[y]) {
            if (char >= '1' && char <= '9') {
                x += parseInt(char, 10);
            }
            else {
                board[y][x] = charToPiece(char);
                x++;
            }
        }
    }
    return board;
}
function generateFEN(board) {
    const rows = [];
    for (let y = 0; y < 10; y++) {
        let rowFen = '';
        let emptyCount = 0;
        for (let x = 0; x < 9; x++) {
            const piece = board[y][x];
            if (piece === null) {
                emptyCount++;
            }
            else {
                if (emptyCount > 0) {
                    rowFen += emptyCount.toString();
                    emptyCount = 0;
                }
                const char = piece.type;
                rowFen += piece.camp === types_1.Camp.RED ? char.toUpperCase() : char.toLowerCase();
            }
        }
        if (emptyCount > 0) {
            rowFen += emptyCount.toString();
        }
        rows.push(rowFen);
    }
    return rows.join('/');
}
