// ============================================
// FILE: thuattoan-fix.js - Hệ thống dự đoán xúc xắc Ultra
// Chứa tất cả 21 model chính + các pattern nâng cao
// ============================================

class UltraDicePredictionSystem {
    constructor() {
        this.history = [];
        this.models = {};
        this.weights = {};
        this.performance = {};
        this.patternDatabase = {};
        this.advancedPatterns = {};
        this.sessionStats = {
            streaks: { T: 0, X: 0, maxT: 0, maxX: 0 },
            transitions: { TtoT: 0, TtoX: 0, XtoT: 0, XtoX: 0 },
            volatility: 0.5,
            patternConfidence: {},
            recentAccuracy: 0,
            bias: { T: 0, X: 0 }
        };
        this.marketState = {
            trend: 'neutral',
            momentum: 0,
            stability: 0.5,
            regime: 'normal'
        };
        this.adaptiveParameters = {
            patternMinLength: 3,
            patternMaxLength: 8,
            volatilityThreshold: 0.7,
            trendStrengthThreshold: 0.6,
            patternConfidenceDecay: 0.95,
            patternConfidenceGrowth: 1.05
        };
        this.initAllModels();
    }

    initAllModels() {
        for (let i = 1; i <= 21; i++) {
            this.models[`model${i}`] = this[`model${i}`].bind(this);
            this._safeBind(`model${i}Mini`);
            this._safeBind(`model${i}Support1`);
            this._safeBind(`model${i}Support2`);
            
            this.weights[`model${i}`] = 1;
            this.performance[`model${i}`] = { 
                correct: 0, 
                total: 0,
                recentCorrect: 0,
                recentTotal: 0,
                streak: 0,
                maxStreak: 0
            };
        }
        
        this.initPatternDatabase();
        this.initAdvancedPatterns();
        this.initSupportModels();
    }

    initPatternDatabase() {
        this.patternDatabase = {
            '1-1': { pattern: ['T', 'X', 'T', 'X'], probability: 0.7, strength: 0.8 },
            '1-2-1': { pattern: ['T', 'X', 'X', 'T'], probability: 0.65, strength: 0.75 },
            '2-1-2': { pattern: ['T', 'T', 'X', 'T', 'T'], probability: 0.68, strength: 0.78 },
            '3-1': { pattern: ['T', 'T', 'T', 'X'], probability: 0.72, strength: 0.82 },
            '1-3': { pattern: ['T', 'X', 'X', 'X'], probability: 0.72, strength: 0.82 },
            '2-2': { pattern: ['T', 'T', 'X', 'X'], probability: 0.66, strength: 0.76 },
            '2-3': { pattern: ['T', 'T', 'X', 'X', 'X'], probability: 0.71, strength: 0.81 },
            '3-2': { pattern: ['T', 'T', 'T', 'X', 'X'], probability: 0.73, strength: 0.83 },
            '4-1': { pattern: ['T', 'T', 'T', 'T', 'X'], probability: 0.76, strength: 0.86 },
            '1-4': { pattern: ['T', 'X', 'X', 'X', 'X'], probability: 0.76, strength: 0.86 },
        };
    }

    initAdvancedPatterns() {
        this.advancedPatterns = {
            'dynamic-1': {
                detect: (data) => {
                    if (data.length < 6) return false;
                    const last6 = data.slice(-6);
                    return last6.filter(x => x === 'T').length === 4 && 
                           last6[last6.length-1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.72,
                description: "4T trong 6 phiên, cuối là T -> dự đoán X"
            },
            'dynamic-2': {
                detect: (data) => {
                    if (data.length < 8) return false;
                    const last8 = data.slice(-8);
                    const tCount = last8.filter(x => x === 'T').length;
                    return tCount >= 6 && last8[last8.length-1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.78,
                description: "6+T trong 8 phiên, cuối là T -> dự đoán X mạnh"
            },
            'alternating-3': {
                detect: (data) => {
                    if (data.length < 5) return false;
                    const last5 = data.slice(-5);
                    for (let i = 1; i < last5.length; i++) {
                        if (last5[i] === last5[i-1]) return false;
                    }
                    return true;
                },
                predict: (data) => data[data.length-1] === 'T' ? 'X' : 'T',
                confidence: 0.68,
                description: "5 phiên đan xen hoàn hảo -> dự đoán đảo chiều"
            },
            'cyclic-7': {
                detect: (data) => {
                    if (data.length < 14) return false;
                    const firstHalf = data.slice(-14, -7);
                    const secondHalf = data.slice(-7);
                    return this.arraysEqual(firstHalf, secondHalf);
                },
                predict: (data) => data[data.length-7],
                confidence: 0.75,
                description: "Chu kỳ 7 phiên lặp lại -> dự đoán theo chu kỳ"
            },
            'momentum-break': {
                detect: (data) => {
                    if (data.length < 9) return false;
                    const first6 = data.slice(-9, -3);
                    const last3 = data.slice(-3);
                    const firstT = first6.filter(x => x === 'T').length;
                    const firstX = first6.filter(x => x === 'X').length;
                    return Math.abs(firstT - firstX) >= 4 && 
                           new Set(last3).size === 1 &&
                           last3[0] !== (firstT > firstX ? 'T' : 'X');
                },
                predict: (data) => {
                    const first6 = data.slice(-9, -3);
                    const firstT = first6.filter(x => x === 'T').length;
                    const firstX = first6.filter(x => x === 'X').length;
                    return firstT > firstX ? 'T' : 'X';
                },
                confidence: 0.71,
                description: "Momentum mạnh bị phá vỡ -> quay lại momentum chính"
            },
            'hybrid-pattern': {
                detect: (data) => {
                    if (data.length < 10) return false;
                    const segment = data.slice(-10);
                    const tCount = segment.filter(x => x === 'T').length;
                    const transitions = segment.slice(1).filter((x, i) => x !== segment[i]).length;
                    return tCount >= 3 && tCount <= 7 && transitions >= 6;
                },
                predict: (data) => {
                    const last = data[data.length-1];
                    const secondLast = data[data.length-2];
                    return last === secondLast ? (last === 'T' ? 'X' : 'T') : last;
                },
                confidence: 0.65,
                description: "Pattern hỗn hợp cao -> dự đoán based on last transitions"
            }
        };
    }

    initSupportModels() {
        this._missingModels = this._missingModels || [];
        for (let i = 1; i <= 21; i++) {
            this._safeBind(`model${i}Support3`);
            this._safeBind(`model${i}Support4`);
        }
    }

    _safeBind(name) {
        this._missingModels = this._missingModels || [];
        if (typeof this[name] === 'function') {
            this.models[name] = this[name].bind(this);
        } else {
            this._missingModels.push(name);
        }
    }

    // ========== 21 MÔ HÌNH CHÍNH ==========

    model1() {
        if (this.history.length < 2) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last = this.history[this.history.length - 1];
        const prediction = last === 'T' ? 'X' : 'T';
        return { prediction, confidence: 0.55, reason: "Đảo chiều cơ bản" };
    }

    model2() {
        if (this.history.length < 3) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last2 = this.history.slice(-2);
        const allSame = last2.every(x => x === last2[0]);
        if (allSame) {
            return { prediction: last2[0] === 'T' ? 'X' : 'T', confidence: 0.6, reason: "Đảo sau 2 cùng loại" };
        }
        return { prediction: last2[1], confidence: 0.52, reason: "Lặp lại kỳ trước" };
    }

    model3() {
        if (this.history.length < 4) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last3 = this.history.slice(-3);
        const tCount = last3.filter(x => x === 'T').length;
        const prediction = tCount > 1.5 ? 'X' : 'T';
        return { prediction, confidence: 0.58, reason: `Cân bằng (T=${tCount})` };
    }

    model4() {
        if (this.history.length < 5) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last4 = this.history.slice(-4);
        const tCount = last4.filter(x => x === 'T').length;
        const prediction = tCount > 2 ? 'X' : 'T';
        return { prediction, confidence: 0.62, reason: `Xu hướng 4 phiên (T=${tCount})` };
    }

    model5() {
        if (this.history.length < 5) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const predictions = this.getAllPredictions();
        const tVotes = Object.values(predictions).filter(p => p && p.prediction === 'T').length;
        const xVotes = Object.values(predictions).filter(p => p && p.prediction === 'X').length;
        const prediction = tVotes > xVotes ? 'T' : 'X';
        return { prediction, confidence: 0.65, reason: `Bình chọn giữa các model (T=${tVotes}, X=${xVotes})` };
    }

    model6() {
        if (this.history.length < 6) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last5 = this.history.slice(-5);
        let streakCount = 1;
        for (let i = last5.length - 1; i > 0; i--) {
            if (last5[i] === last5[i-1]) streakCount++;
            else break;
        }
        const prediction = streakCount > 2 ? (last5[last5.length-1] === 'T' ? 'X' : 'T') : last5[last5.length-1];
        return { prediction, confidence: 0.59, reason: `Streak=${streakCount}` };
    }

    model7() {
        if (this.history.length < 3) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last3 = this.history.slice(-3);
        const pattern = last3.join('');
        const prediction = pattern === 'TTX' || pattern === 'XXT' ? 'T' : 'X';
        return { prediction, confidence: 0.57, reason: `Pattern 3 phiên: ${pattern}` };
    }

    model8() {
        if (this.history.length < 7) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last6 = this.history.slice(-6);
        const tCount = last6.filter(x => x === 'T').length;
        const prediction = Math.abs(tCount - 3) > 1.5 ? (tCount > 3 ? 'X' : 'T') : 'T';
        return { prediction, confidence: 0.61, reason: `Cân bằng 6 phiên (T=${tCount})` };
    }

    model9() {
        if (this.history.length < 4) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last4 = this.history.slice(-4);
        const transitions = last4.slice(1).filter((x, i) => x !== last4[i]).length;
        const prediction = transitions > 2 ? 'T' : 'X';
        return { prediction, confidence: 0.54, reason: `Chuyển đổi: ${transitions}` };
    }

    model10() {
        if (this.history.length < 5) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const bias = this.calculateBias();
        const prediction = Math.abs(bias.T - bias.X) > 0.1 ? (bias.T > bias.X ? 'X' : 'T') : 'T';
        return { prediction, confidence: 0.56, reason: `Chệch hướng (T=${bias.T.toFixed(2)}, X=${bias.X.toFixed(2)})` };
    }

    model11() {
        if (this.history.length < 8) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last7 = this.history.slice(-7);
        const firstHalf = last7.slice(0, 3).join('');
        const secondHalf = last7.slice(4).join('');
        const prediction = firstHalf === secondHalf ? 'T' : 'X';
        return { prediction, confidence: 0.58, reason: `Chu kỳ 7 phiên` };
    }

    model12() {
        if (this.history.length < 6) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last5 = this.history.slice(-5);
        let maxStreak = 1, currentStreak = 1;
        for (let i = 1; i < last5.length; i++) {
            if (last5[i] === last5[i-1]) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }
        const prediction = maxStreak > 2 ? (last5[last5.length-1] === 'T' ? 'X' : 'T') : last5[last5.length-1];
        return { prediction, confidence: 0.62, reason: `Max streak=${maxStreak}` };
    }

    model13() {
        if (this.history.length < 9) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last8 = this.history.slice(-8);
        const tCount = last8.filter(x => x === 'T').length;
        const volatility = Math.abs(tCount - 4) / 4;
        const prediction = volatility > 0.5 ? (tCount > 4 ? 'X' : 'T') : 'T';
        return { prediction, confidence: 0.63, reason: `Độ biến động: ${volatility.toFixed(2)}` };
    }

    model14() {
        if (this.history.length < 10) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last9 = this.history.slice(-9);
        const first3 = last9.slice(0, 3).filter(x => x === 'T').length;
        const second3 = last9.slice(3, 6).filter(x => x === 'T').length;
        const third3 = last9.slice(6).filter(x => x === 'T').length;
        const trend = (third3 - first3) / 3;
        const prediction = trend > 0 ? 'X' : 'T';
        return { prediction, confidence: 0.59, reason: `Xu hướng 9 phiên: ${trend.toFixed(2)}` };
    }

    model15() {
        if (this.history.length < 5) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last5 = this.history.slice(-5);
        const pattern = last5.join('');
        const isAlternating = /^(TX|XT)+T?X?$/.test(pattern);
        const prediction = isAlternating ? (last5[last5.length-1] === 'T' ? 'X' : 'T') : last5[last5.length-1];
        return { prediction, confidence: 0.61, reason: `Mẫu đan xen: ${isAlternating ? 'Có' : 'Không'}` };
    }

    model16() {
        if (this.history.length < 7) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last6 = this.history.slice(-6);
        const tCount = last6.filter(x => x === 'T').length;
        const entropy = -[tCount, 6-tCount].map(x => (x/6)*Math.log2(x/6 || 0.5)).reduce((a,b) => a+b, 0);
        const prediction = entropy > 0.9 ? (tCount > 3 ? 'X' : 'T') : last6[last6.length-1];
        return { prediction, confidence: 0.58, reason: `Entropy: ${entropy.toFixed(2)}` };
    }

    model17() {
        if (this.history.length < 4) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last4 = this.history.slice(-4);
        const tCount = last4.filter(x => x === 'T').length;
        const prediction = tCount === 2 ? 'T' : (tCount > 2 ? 'X' : 'T');
        return { prediction, confidence: 0.55, reason: `Phân bố 4 phiên (T=${tCount})` };
    }

    model18() {
        if (this.history.length < 6) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last5 = this.history.slice(-5);
        const firstTwo = last5.slice(0, 2).join('');
        const lastTwo = last5.slice(3).join('');
        const prediction = firstTwo === lastTwo ? 'X' : 'T';
        return { prediction, confidence: 0.57, reason: `So sánh cặp: ${firstTwo} vs ${lastTwo}` };
    }

    model19() {
        if (this.history.length < 3) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last3 = this.history.slice(-3);
        const countT = last3.filter(x => x === 'T').length;
        const countX = 3 - countT;
        const prediction = countT > countX ? 'X' : 'T';
        return { prediction, confidence: 0.56, reason: `Tỷ lệ 3 phiên: T=${countT}, X=${countX}` };
    }

    model20() {
        if (this.history.length < 8) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last7 = this.history.slice(-7);
        const pattern = last7.join('');
        const prediction = pattern.includes('TTT') ? 'X' : 'T';
        return { prediction, confidence: 0.60, reason: `Chứa TTT: ${pattern.includes('TTT')}` };
    }

    model21() {
        if (this.history.length < 10) return { prediction: null, confidence: 0, reason: "Không đủ dữ liệu" };
        const last9 = this.history.slice(-9);
        const tCount = last9.filter(x => x === 'T').length;
        const xCount = 9 - tCount;
        const dominance = Math.abs(tCount - xCount) / 9;
        const prediction = dominance > 0.3 ? (tCount > xCount ? 'X' : 'T') : 'T';
        return { prediction, confidence: 0.64, reason: `Thống trị: ${dominance.toFixed(2)}` };
    }

    // ========== UTILITY METHODS ==========

    addResult(result) {
        if (!result || (result !== 'T' && result !== 'X')) {
            return;
        }

        this.history.push(result);
        this.updateSessionStats();
        this.updatePatternDatabase();
        this.updateMarketState();
    }

    updateSessionStats() {
        if (this.history.length === 0) return;

        const last = this.history[this.history.length - 1];
        
        if (last === 'T') {
            this.sessionStats.streaks.T++;
            this.sessionStats.streaks.X = 0;
            this.sessionStats.streaks.maxT = Math.max(
                this.sessionStats.streaks.maxT,
                this.sessionStats.streaks.T
            );
        } else {
            this.sessionStats.streaks.X++;
            this.sessionStats.streaks.T = 0;
            this.sessionStats.streaks.maxX = Math.max(
                this.sessionStats.streaks.maxX,
                this.sessionStats.streaks.X
            );
        }

        if (this.history.length >= 2) {
            const prev = this.history[this.history.length - 2];
            if (prev === 'T' && last === 'T') this.sessionStats.transitions.TtoT++;
            else if (prev === 'T' && last === 'X') this.sessionStats.transitions.TtoX++;
            else if (prev === 'X' && last === 'T') this.sessionStats.transitions.XtoT++;
            else if (prev === 'X' && last === 'X') this.sessionStats.transitions.XtoX++;
        }

        this.updateVolatility();
        this.updateBias();
    }

    updateVolatility() {
        if (this.history.length < 2) return;

        const windowSize = Math.min(20, this.history.length);
        const window = this.history.slice(-windowSize);
        const tCount = window.filter(x => x === 'T').length;
        const xCount = windowSize - tCount;
        
        const variance = Math.abs(tCount - xCount) / windowSize;
        this.sessionStats.volatility = variance;
    }

    updateBias() {
        if (this.history.length === 0) return;

        const recentWindow = Math.min(30, this.history.length);
        const recent = this.history.slice(-recentWindow);
        const tCount = recent.filter(x => x === 'T').length;

        this.sessionStats.bias.T = tCount / recentWindow;
        this.sessionStats.bias.X = 1 - this.sessionStats.bias.T;
    }

    calculateBias() {
        return this.sessionStats.bias;
    }

    updatePatternDatabase() {
        if (this.history.length < 3) return;

        const last5 = this.history.slice(-5);
        const pattern = last5.join('');

        if (!this.patternDatabase[pattern]) {
            this.patternDatabase[pattern] = {
                pattern: last5,
                probability: 0.5,
                strength: 0.5,
                occurrences: 0
            };
        }

        this.patternDatabase[pattern].occurrences = (this.patternDatabase[pattern].occurrences || 0) + 1;
        this.patternDatabase[pattern].probability = Math.min(0.95, 0.5 + (this.patternDatabase[pattern].occurrences || 0) * 0.05);
        this.patternDatabase[pattern].strength = Math.min(0.95, 0.5 + (this.patternDatabase[pattern].occurrences || 0) * 0.03);
    }

    updateMarketState() {
        if (this.history.length < 3) return;

        const last10 = this.history.slice(-Math.min(10, this.history.length));
        const tCount = last10.filter(x => x === 'T').length;
        const momentum = (tCount / last10.length) - 0.5;

        this.marketState.momentum = momentum;
        
        if (Math.abs(momentum) > 0.3) {
            this.marketState.trend = momentum > 0 ? 'uptrend' : 'downtrend';
            this.marketState.regime = 'trending';
        } else if (this.sessionStats.volatility > 0.7) {
            this.marketState.trend = 'volatile';
            this.marketState.regime = 'volatile';
        } else {
            this.marketState.trend = 'neutral';
            this.marketState.regime = 'normal';
        }

        this.marketState.stability = 1 - this.sessionStats.volatility;
    }

    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        return arr1.every((val, idx) => val === arr2[idx]);
    }

    getAllPredictions() {
        if (this._inGetAllPredictions) {
            return {};
        }
        this._inGetAllPredictions = true;
        try {
            const predictions = {};
            for (let i = 1; i <= 21; i++) {
                predictions[`model${i}`] = this.models[`model${i}`]();
            }
            return predictions;
        } finally {
            this._inGetAllPredictions = false;
        }
    }

    getFinalPrediction() {
        const predictions = this.getAllPredictions();
        let tScore = 0;
        let xScore = 0;
        let totalWeight = 0;
        let reasons = [];
        
        for (const [modelName, prediction] of Object.entries(predictions)) {
            if (prediction && prediction.prediction) {
                const weight = this.weights[modelName] || 1;
                const score = prediction.confidence * weight;
                
                if (prediction.prediction === 'T') {
                    tScore += score;
                } else if (prediction.prediction === 'X') {
                    xScore += score;
                }
                
                totalWeight += weight;
                reasons.push(`${modelName}: ${prediction.reason} (${prediction.confidence.toFixed(2)})`);
            }
        }
        
        if (totalWeight === 0) return null;
        
        let finalPrediction = null;
        let finalConfidence = 0;
        
        if (tScore > xScore) {
            finalPrediction = 'T';
            finalConfidence = tScore / (tScore + xScore);
        } else if (xScore > tScore) {
            finalPrediction = 'X';
            finalConfidence = xScore / (tScore + xScore);
        }
        
        finalConfidence = this.adjustConfidenceByVolatility(finalConfidence);
        
        return {
            prediction: finalPrediction,
            confidence: finalConfidence,
            reasons: reasons,
            details: predictions,
            sessionStats: this.sessionStats,
            marketState: this.marketState
        };
    }

    adjustConfidenceByVolatility(confidence) {
        if (this.sessionStats.volatility > 0.7) {
            return confidence * 0.8;
        }
        if (this.sessionStats.volatility < 0.3) {
            return Math.min(0.95, confidence * 1.1);
        }
        return confidence;
    }

    updatePerformance(actualResult) {
        const predictions = this.getAllPredictions();
        
        for (const [modelName, prediction] of Object.entries(predictions)) {
            if (prediction && prediction.prediction) {
                this.performance[modelName].total++;
                this.performance[modelName].recentTotal++;
                
                if (prediction.prediction === actualResult) {
                    this.performance[modelName].correct++;
                    this.performance[modelName].recentCorrect++;
                    this.performance[modelName].streak++;
                    this.performance[modelName].maxStreak = Math.max(
                        this.performance[modelName].maxStreak,
                        this.performance[modelName].streak
                    );
                } else {
                    this.performance[modelName].streak = 0;
                }
                
                if (this.performance[modelName].recentTotal > 50) {
                    this.performance[modelName].recentTotal--;
                    if (this.performance[modelName].recentCorrect > 0 && 
                        this.performance[modelName].recentCorrect / this.performance[modelName].recentTotal > 
                        this.performance[modelName].correct / this.performance[modelName].total) {
                        this.performance[modelName].recentCorrect--;
                    }
                }
                
                const accuracy = this.performance[modelName].correct / this.performance[modelName].total;
                this.weights[modelName] = Math.max(0.1, Math.min(2, accuracy * 2));
            }
        }
        
        const totalPredictions = Object.values(predictions).filter(p => p && p.prediction).length;
        const correctPredictions = Object.values(predictions).filter(p => p && p.prediction === actualResult).length;
        this.sessionStats.recentAccuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
    }
}

// Test function
function simulateUltraTest() {
    const system = new UltraDicePredictionSystem();
    
    const testPatterns = [
        'T', 'X', 'T', 'X', 'T', 'X', 'T', 'X',
        'T', 'T', 'X', 'X', 'T', 'T', 'X', 'X',
        'T', 'T', 'T', 'T', 'X', 'X', 'T', 'T', 'T', 'X',
        'X', 'T', 'X', 'T', 'X', 'T', 'X', 'T', 'X', 'T',
        'T', 'T', 'T', 'X', 'T', 'T', 'T', 'X', 'T', 'T', 'T', 'X',
        'T', 'X', 'X', 'T', 'X', 'T', 'T', 'X', 'T', 'X', 'X', 'T'
    ];
    
    console.log("🧪 Testing Ultra Dice Prediction System");
    console.log("═══════════════════════════════════════");
    
    testPatterns.forEach((result, index) => {
        system.addResult(result);
        
        if (index >= 15 && index % 3 === 0) {
            const prediction = system.getFinalPrediction();
            console.log(`\nPhiên ${index + 1}: ${result}`);
            if (prediction) {
                console.log(`📊 Dự đoán: ${prediction.prediction}, Confidence: ${prediction.confidence.toFixed(2)}`);
                console.log(`💡 Lý do: ${prediction.reasons[0]}`);
            } else {
                console.log("❌ Không đủ dữ liệu để dự đoán");
            }
        }
    });
    
    console.log("\n\n📈 THỐNG KÊ CUỐI CÙNG");
    console.log("═══════════════════════════════════════");
    console.log(`✅ Streak T: ${system.sessionStats.streaks.T}, X: ${system.sessionStats.streaks.X}`);
    console.log(`📊 Độ biến động: ${system.sessionStats.volatility.toFixed(2)}`);
    console.log(`🎯 Chuyển đổi: T→T=${system.sessionStats.transitions.TtoT}, T→X=${system.sessionStats.transitions.TtoX}, X→T=${system.sessionStats.transitions.XtoT}, X→X=${system.sessionStats.transitions.XtoX}`);
    console.log(`🔍 Trạng thái thị trường: ${JSON.stringify(system.marketState)}`);
}

// Only run test when file is executed directly
if (require.main === module) {
    simulateUltraTest();
}

module.exports = { UltraDicePredictionSystem };
module.exports.default = UltraDicePredictionSystem;
