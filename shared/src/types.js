"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PieceType = exports.GameStatus = exports.Camp = void 0;
var Camp;
(function (Camp) {
    Camp["RED"] = "w";
    Camp["BLACK"] = "b";
})(Camp || (exports.Camp = Camp = {}));
var GameStatus;
(function (GameStatus) {
    GameStatus["WAITING"] = "WAITING";
    GameStatus["PLAYING"] = "PLAYING";
    GameStatus["CHECK"] = "CHECK";
    GameStatus["CHECKMATE"] = "CHECKMATE";
    GameStatus["STALEMATE"] = "STALEMATE";
    GameStatus["DRAW"] = "DRAW";
})(GameStatus || (exports.GameStatus = GameStatus = {}));
var PieceType;
(function (PieceType) {
    PieceType["KING"] = "k";
    PieceType["ADVISOR"] = "a";
    PieceType["BISHOP"] = "b";
    PieceType["KNIGHT"] = "n";
    PieceType["ROOK"] = "r";
    PieceType["CANNON"] = "c";
    PieceType["PAWN"] = "p";
})(PieceType || (exports.PieceType = PieceType = {}));
