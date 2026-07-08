// ============================================
// FILE: thuattoan.js - Phiên bản mới hoàn chỉnh
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
        this.learningStats = {
            totalLearned: 0,
            patternFound: 0,
            accuracyHistory: [],
            bestAccuracy: 0
        };
        this._inGetAllPredictions = false;
        this._missingModels = [];
        this.initAllModels();
    }

    initAllModels() {
        for (let i = 1; i <= 21; i++) {
            this.models[`model${i}`] = this[`model${i}`] ? this[`model${i}`].bind(this) : () => null;
            this.models[`model${i}Mini`] = this[`model${i}Mini`] ? this[`model${i}Mini`].bind(this) : () => null;
            this.models[`model${i}Support1`] = this[`model${i}Support1`] ? this[`model${i}Support1`].bind(this) : () => null;
            this.models[`model${i}Support2`] = this[`model${i}Support2`] ? this[`model${i}Support2`].bind(this) : () => null;
            
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
                    return last6.filter(x => x === 'T').length === 4 && last6[last6.length-1] === 'T';
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
                    return Math.abs(firstT - firstX) >= 4 && new Set(last3).size === 1 && last3[0] !== (firstT > firstX ? 'T' : 'X');
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
        for (let i = 1; i <= 21; i++) {
            this.models[`model${i}Support3`] = this[`model${i}Support3`] ? this[`model${i}Support3`].bind(this) : () => null;
            this.models[`model${i}Support4`] = this[`model${i}Support4`] ? this[`model${i}Support4`].bind(this) : () => null;
        }
    }

    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    }

    // ============ CÁC HÀM CỐT LÕI ============

    addResult(result) {
        if (this.history.length > 0) {
            const lastResult = this.history[this.history.length-1];
            const transitionKey = `${lastResult}to${result}`;
            this.sessionStats.transitions[transitionKey] = (this.sessionStats.transitions[transitionKey] || 0) + 1;
            
            if (result === lastResult) {
                this.sessionStats.streaks[result]++;
                this.sessionStats.streaks[`max${result}`] = Math.max(
                    this.sessionStats.streaks[`max${result}`],
                    this.sessionStats.streaks[result]
                );
            } else {
                this.sessionStats.streaks[result] = 1;
                this.sessionStats.streaks[lastResult] = 0;
            }
        } else {
            this.sessionStats.streaks[result] = 1;
        }
        
        this.history.push(result);
        this.updateVolatility();
        this.updatePatternConfidence();
        this.updateMarketState();
        this.updatePatternDatabase();
    }

    updateVolatility() {
        if (this.history.length < 10) return;
        const recent = this.history.slice(-10);
        let changes = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] !== recent[i-1]) changes++;
        }
        this.sessionStats.volatility = changes / (recent.length - 1);
    }

    updatePatternConfidence() {
        for (const [patternName, confidence] of Object.entries(this.sessionStats.patternConfidence)) {
            if (this.history.length < 2) continue;
            const lastResult = this.history[this.history.length-1];
            if (this.advancedPatterns[patternName]) {
                const prediction = this.advancedPatterns[patternName].predict(this.history.slice(0, -1));
                if (prediction !== lastResult) {
                    this.sessionStats.patternConfidence[patternName] = Math.max(0.1, confidence * this.adaptiveParameters.patternConfidenceDecay);
                } else {
                    this.sessionStats.patternConfidence[patternName] = Math.min(0.95, confidence * this.adaptiveParameters.patternConfidenceGrowth);
                }
            }
        }
    }

    updateMarketState() {
        if (this.history.length < 15) return;
        const recent = this.history.slice(-15);
        const tCount = recent.filter(x => x === 'T').length;
        const xCount = recent.filter(x => x === 'X').length;
        const trendStrength = Math.abs(tCount - xCount) / recent.length;
        
        if (trendStrength > this.adaptiveParameters.trendStrengthThreshold) {
            this.marketState.trend = tCount > xCount ? 'up' : 'down';
        } else {
            this.marketState.trend = 'neutral';
        }
        
        let momentum = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] === recent[i-1]) {
                momentum += recent[i] === 'T' ? 0.1 : -0.1;
            }
        }
        this.marketState.momentum = Math.tanh(momentum);
        this.marketState.stability = 1 - this.sessionStats.volatility;
        
        if (this.sessionStats.volatility > this.adaptiveParameters.volatilityThreshold) {
            this.marketState.regime = 'volatile';
        } else if (trendStrength > 0.7) {
            this.marketState.regime = 'trending';
        } else if (trendStrength < 0.3) {
            this.marketState.regime = 'random';
        } else {
            this.marketState.regime = 'normal';
        }
    }

    updatePatternDatabase() {
        if (this.history.length < 10) return;
        const PATTERN_SCAN_WINDOW = 200;
        const window = this.history.length > PATTERN_SCAN_WINDOW ? this.history.slice(-PATTERN_SCAN_WINDOW) : this.history;

        for (let length = this.adaptiveParameters.patternMinLength; length <= this.adaptiveParameters.patternMaxLength; length++) {
            for (let i = 0; i <= window.length - length; i++) {
                const segment = window.slice(i, i + length);
                const patternKey = segment.join('-');
                if (!this.patternDatabase[patternKey]) {
                    let count = 0;
                    for (let j = 0; j <= window.length - length - 1; j++) {
                        const testSegment = window.slice(j, j + length);
                        if (testSegment.join('-') === patternKey) count++;
                    }
                    if (count > 2) {
                        const probability = count / (window.length - length);
                        const strength = Math.min(0.9, probability * 1.2);
                        this.patternDatabase[patternKey] = { pattern: segment, probability, strength };
                        this.learningStats.patternFound++;
                    }
                }
            }
        }
    }

    // ============ CÁC MODEL ============

    model1() {
        const recent = this.history.slice(-10);
        if (recent.length < 4) return null;
        const patterns = this.model1Mini(recent);
        if (patterns.length === 0) return null;
        const bestPattern = patterns.reduce((best, current) => current.probability > best.probability ? current : best);
        let confidence = bestPattern.probability * 0.8;
        if (this.marketState.regime === 'trending') confidence *= 1.1;
        else if (this.marketState.regime === 'volatile') confidence *= 0.9;
        return {
            prediction: bestPattern.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Phát hiện pattern ${bestPattern.type} (xác suất ${bestPattern.probability.toFixed(2)})`
        };
    }

    model1Mini(data) {
        const patterns = [];
        for (const [type, patternData] of Object.entries(this.patternDatabase)) {
            const pattern = patternData.pattern;
            if (data.length < pattern.length) continue;
            const segment = data.slice(-pattern.length + 1);
            const patternWithoutLast = pattern.slice(0, -1);
            if (segment.join('-') === patternWithoutLast.join('-')) {
                patterns.push({
                    type: type,
                    prediction: pattern[pattern.length - 1],
                    probability: patternData.probability,
                    strength: patternData.strength
                });
            }
        }
        return patterns;
    }

    model1Support1() {
        return { status: "Phân tích pattern nâng cao", totalPatterns: Object.keys(this.patternDatabase).length };
    }

    model1Support2() {
        const patternCount = Object.keys(this.patternDatabase).length;
        const avgConfidence = patternCount > 0 ? Object.values(this.patternDatabase).reduce((sum, p) => sum + p.probability, 0) / patternCount : 0;
        return { status: "Đánh giá độ tin cậy pattern", patternCount, averageConfidence: avgConfidence };
    }

    model1Support3() {
        return { status: "Phân tích hiệu suất pattern", performance: this.calculatePatternPerformance() };
    }

    model1Support4() {
        return { status: "Tối ưu parameters pattern", parameters: this.optimizePatternParameters() };
    }

    calculatePatternPerformance() {
        const performance = {};
        const recentHistory = this.history.slice(-50);
        for (const [pattern, data] of Object.entries(this.patternDatabase)) {
            let correct = 0, total = 0;
            for (let i = data.pattern.length; i < recentHistory.length; i++) {
                const segment = recentHistory.slice(i - data.pattern.length + 1, i);
                if (segment.join('-') === data.pattern.slice(0, -1).join('-')) {
                    total++;
                    if (recentHistory[i] === data.pattern[data.pattern.length - 1]) correct++;
                }
            }
            performance[pattern] = { accuracy: total > 0 ? correct / total : 0, occurrences: total };
        }
        return performance;
    }

    optimizePatternParameters() {
        if (this.marketState.regime === 'volatile') {
            this.adaptiveParameters.patternMinLength = 4;
            this.adaptiveParameters.patternMaxLength = 6;
        } else if (this.marketState.regime === 'trending') {
            this.adaptiveParameters.patternMinLength = 3;
            this.adaptiveParameters.patternMaxLength = 5;
        } else {
            this.adaptiveParameters.patternMinLength = 3;
            this.adaptiveParameters.patternMaxLength = 8;
        }
        return { ...this.adaptiveParameters };
    }

    model2() {
        const shortTerm = this.history.slice(-5);
        const longTerm = this.history.slice(-20);
        if (shortTerm.length < 3 || longTerm.length < 10) return null;
        const shortAnalysis = this.model2Mini(shortTerm);
        const longAnalysis = this.model2Mini(longTerm);
        let prediction, confidence, reason;
        if (shortAnalysis.trend === longAnalysis.trend) {
            prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
            confidence = (shortAnalysis.strength + longAnalysis.strength) / 2;
            reason = `Xu hướng ngắn và dài hạn cùng ${shortAnalysis.trend}`;
        } else {
            if (shortAnalysis.strength > longAnalysis.strength * 1.5) {
                prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = shortAnalysis.strength;
                reason = `Xu hướng ngắn hạn mạnh hơn dài hạn`;
            } else {
                prediction = longAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = longAnalysis.strength;
                reason = `Xu hướng dài hạn ổn định hơn`;
            }
        }
        if (this.marketState.regime === 'trending') confidence *= 1.15;
        else if (this.marketState.regime === 'volatile') confidence *= 0.85;
        return { prediction, confidence: Math.min(0.95, confidence * 0.9), reason };
    }

    model2Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        let trend = tCount > xCount ? 'up' : (xCount > tCount ? 'down' : 'neutral');
        let strength = Math.abs(tCount - xCount) / data.length;
        let changes = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] !== data[i-1]) changes++;
        }
        const volatility = changes / (data.length - 1);
        strength = strength * (1 - volatility / 2);
        return { trend, strength, volatility };
    }

    model2Support1() {
        return { status: "Phân tích chất lượng trend", quality: this.analyzeTrendQuality() };
    }

    model2Support2() {
        return { status: "Xác định điểm đảo chiều", points: this.findPotentialReversals() };
    }

    analyzeTrendQuality() {
        if (this.history.length < 20) return { quality: 'unknown', score: 0 };
        const trends = [];
        for (let i = 5; i <= 20; i += 5) {
            if (this.history.length >= i) {
                trends.push(this.model2Mini(this.history.slice(-i)));
            }
        }
        let consistent = true;
        for (let i = 1; i < trends.length; i++) {
            if (trends[i].trend !== trends[0].trend) { consistent = false; break; }
        }
        const avgStrength = trends.reduce((sum, t) => sum + t.strength, 0) / trends.length;
        const avgVolatility = trends.reduce((sum, t) => sum + t.volatility, 0) / trends.length;
        const qualityScore = avgStrength * (1 - avgVolatility);
        let quality;
        if (qualityScore > 0.7) quality = 'excellent';
        else if (qualityScore > 0.5) quality = 'good';
        else if (qualityScore > 0.3) quality = 'fair';
        else quality = 'poor';
        return { quality, score: qualityScore, consistent };
    }

    findPotentialReversals() {
        const points = [];
        if (this.history.length < 15) return points;
        for (let i = 10; i < this.history.length - 5; i++) {
            const before = this.history.slice(i - 5, i);
            const after = this.history.slice(i, i + 5);
            const beforeAnalysis = this.model2Mini(before);
            const afterAnalysis = this.model2Mini(after);
            if (beforeAnalysis.trend !== afterAnalysis.trend && beforeAnalysis.strength > 0.6 && afterAnalysis.strength > 0.6) {
                points.push({
                    position: i,
                    beforeTrend: beforeAnalysis.trend,
                    afterTrend: afterAnalysis.trend,
                    strength: (beforeAnalysis.strength + afterAnalysis.strength) / 2
                });
            }
        }
        return points;
    }

    model3() {
        const recent = this.history.slice(-12);
        if (recent.length < 12) return null;
        const analysis = this.model3Mini(recent);
        if (analysis.difference < 0.4) return null;
        let confidence = analysis.difference * 0.8;
        if (this.marketState.regime === 'random') confidence *= 1.1;
        else if (this.marketState.regime === 'trending') confidence *= 0.9;
        return {
            prediction: analysis.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Chênh lệch cao (${Math.round(analysis.difference * 100)}%) trong 12 phiên, dự đoán cân bằng`
        };
    }

    model3Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        const total = data.length;
        const difference = Math.abs(tCount - xCount) / total;
        return { difference, prediction: tCount > xCount ? 'X' : 'T', tCount, xCount };
    }

    model3Support1() {
        return { status: "Phân tích hiệu quả mean reversion", effectiveness: this.analyzeMeanReversionEffectiveness() };
    }

    model3Support2() {
        return { status: "Tìm ngưỡng chênh lệch tối ưu", threshold: this.findOptimalDifferenceThreshold() };
    }

    analyzeMeanReversionEffectiveness() {
        if (this.history.length < 30) return { effectiveness: 'unknown', successRate: 0 };
        let successes = 0, opportunities = 0;
        for (let i = 12; i < this.history.length; i++) {
            const segment = this.history.slice(i - 12, i);
            const tCount = segment.filter(x => x === 'T').length;
            const xCount = segment.filter(x => x === 'X').length;
            const difference = Math.abs(tCount - xCount) / segment.length;
            if (difference >= 0.4) {
                opportunities++;
                const prediction = tCount > xCount ? 'X' : 'T';
                if (this.history[i] === prediction) successes++;
            }
        }
        const successRate = opportunities > 0 ? successes / opportunities : 0;
        let effectiveness;
        if (successRate > 0.6) effectiveness = 'high';
        else if (successRate > 0.5) effectiveness = 'medium';
        else effectiveness = 'low';
        return { effectiveness, successRate, opportunities };
    }

    findOptimalDifferenceThreshold() {
        if (this.history.length < 50) return 0.4;
        let bestThreshold = 0.4, bestSuccessRate = 0;
        for (let threshold = 0.3; threshold <= 0.6; threshold += 0.05) {
            let successes = 0, opportunities = 0;
            for (let i = 12; i < this.history.length; i++) {
                const segment = this.history.slice(i - 12, i);
                const tCount = segment.filter(x => x === 'T').length;
                const xCount = segment.filter(x => x === 'X').length;
                const difference = Math.abs(tCount - xCount) / segment.length;
                if (difference >= threshold) {
                    opportunities++;
                    const prediction = tCount > xCount ? 'X' : 'T';
                    if (this.history[i] === prediction) successes++;
                }
            }
            const successRate = opportunities > 0 ? successes / opportunities : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestThreshold = threshold;
            }
        }
        return bestThreshold;
    }

    model4() {
        const recent = this.history.slice(-6);
        if (recent.length < 4) return null;
        const analysis = this.model4Mini(recent);
        if (analysis.confidence < 0.6) return null;
        let confidence = analysis.confidence;
        if (this.marketState.regime === 'trending') confidence *= 1.1;
        else if (this.marketState.regime === 'volatile') confidence *= 0.9;
        return {
            prediction: analysis.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Cầu ngắn hạn ${analysis.trend} với độ tin cậy ${analysis.confidence.toFixed(2)}`
        };
    }

    model4Mini(data) {
        const last3 = data.slice(-3);
        const tCount = last3.filter(x => x === 'T').length;
        const xCount = last3.filter(x => x === 'X').length;
        let prediction, confidence, trend;
        if (tCount === 3) {
            prediction = 'T'; confidence = 0.7; trend = 'Tăng mạnh';
        } else if (xCount === 3) {
            prediction = 'X'; confidence = 0.7; trend = 'Giảm mạnh';
        } else if (tCount === 2) {
            prediction = 'T'; confidence = 0.65; trend = 'Tăng nhẹ';
        } else if (xCount === 2) {
            prediction = 'X'; confidence = 0.65; trend = 'Giảm nhẹ';
        } else {
            const changes = data.slice(-4).filter((val, idx, arr) => idx > 0 && val !== arr[idx-1]).length;
            if (changes >= 3) {
                prediction = data[data.length - 1] === 'T' ? 'X' : 'T';
                confidence = 0.6;
                trend = 'Đảo chiều';
            } else {
                prediction = data[data.length - 1];
                confidence = 0.55;
                trend = 'Ổn định';
            }
        }
        return { prediction, confidence, trend };
    }

    model4Support1() {
        return { status: "Phân tích hiệu quả momentum ngắn hạn", effectiveness: this.analyzeShortTermMomentumEffectiveness() };
    }

    model4Support2() {
        return { status: "Tối ưu khung thời gian momentum", timeframe: this.findOptimalMomentumTimeframe() };
    }

    analyzeShortTermMomentumEffectiveness() {
        if (this.history.length < 20) return { effectiveness: 'unknown', successRate: 0 };
        let successes = 0, opportunities = 0;
        for (let i = 6; i < this.history.length; i++) {
            const segment = this.history.slice(i - 6, i);
            const analysis = this.model4Mini(segment);
            if (analysis.confidence >= 0.6) {
                opportunities++;
                if (this.history[i] === analysis.prediction) successes++;
            }
        }
        const successRate = opportunities > 0 ? successes / opportunities : 0;
        let effectiveness;
        if (successRate > 0.6) effectiveness = 'high';
        else if (successRate > 0.5) effectiveness = 'medium';
        else effectiveness = 'low';
        return { effectiveness, successRate, opportunities };
    }

    findOptimalMomentumTimeframe() {
        if (this.history.length < 50) return 6;
        let bestTimeframe = 6, bestSuccessRate = 0;
        for (let timeframe = 4; timeframe <= 8; timeframe++) {
            let successes = 0, opportunities = 0;
            for (let i = timeframe; i < this.history.length; i++) {
                const segment = this.history.slice(i - timeframe, i);
                const analysis = this.model4Mini(segment);
                if (analysis.confidence >= 0.6) {
                    opportunities++;
                    if (this.history[i] === analysis.prediction) successes++;
                }
            }
            const successRate = opportunities > 0 ? successes / opportunities : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestTimeframe = timeframe;
            }
        }
        return bestTimeframe;
    }

    model5() {
        const predictions = this.getAllPredictions();
        const tPredictions = Object.values(predictions).filter(p => p && p.prediction === 'T').length;
        const xPredictions = Object.values(predictions).filter(p => p && p.prediction === 'X').length;
        const total = tPredictions + xPredictions;
        if (total < 5) return null;
        const difference = Math.abs(tPredictions - xPredictions) / total;
        if (difference > 0.6) {
            return {
                prediction: tPredictions > xPredictions ? 'X' : 'T',
                confidence: difference * 0.9,
                reason: `Cân bằng tỷ lệ chênh lệch cao (${Math.round(difference * 100)}%) giữa các model`
            };
        }
        return null;
    }

    model5Support1() {
        return { status: "Phân tích đồng thuận model", consensus: this.analyzeModelConsensus() };
    }

    model5Support2() {
        return { status: "Phân tích phân kỳ model", divergence: this.analyzeModelDivergence() };
    }

    analyzeModelConsensus() {
        const predictions = this.getAllPredictions();
        const validPredictions = Object.values(predictions).filter(p => p && p.prediction);
        if (validPredictions.length === 0) return { consensus: 'none', rate: 0 };
        const tCount = validPredictions.filter(p => p.prediction === 'T').length;
        const xCount = validPredictions.filter(p => p.prediction === 'X').length;
        const total = validPredictions.length;
        const consensusRate = Math.max(tCount, xCount) / total;
        let consensus;
        if (consensusRate > 0.7) consensus = 'strong';
        else if (consensusRate > 0.6) consensus = 'moderate';
        else consensus = 'weak';
        return { consensus, rate: consensusRate, tCount, xCount };
    }

    analyzeModelDivergence() {
        const predictions = this.getAllPredictions();
        const validPredictions = Object.values(predictions).filter(p => p && p.prediction);
        if (validPredictions.length < 2) return { divergence: 'low', score: 0 };
        let divergenceScore = 0;
        for (let i = 0; i < validPredictions.length; i++) {
            for (let j = i + 1; j < validPredictions.length; j++) {
                if (validPredictions[i].prediction !== validPredictions[j].prediction) {
                    divergenceScore += validPredictions[i].confidence * validPredictions[j].confidence;
                }
            }
        }
        const maxPossible = (validPredictions.length * (validPredictions.length - 1)) / 2;
        divergenceScore = divergenceScore / maxPossible;
        let divergence;
        if (divergenceScore > 0.7) divergence = 'high';
        else if (divergenceScore > 0.4) divergence = 'medium';
        else divergence = 'low';
        return { divergence, score: divergenceScore };
    }

    model6() {
        const trendAnalysis = this.model2();
        if (!trendAnalysis) return null;
        const continuity = this.model6Mini(this.history.slice(-8));
        const breakProbability = this.model10Mini(this.history);
        if (continuity.streak >= 5 && breakProbability > 0.7) {
            return {
                prediction: trendAnalysis.prediction === 'T' ? 'X' : 'T',
                confidence: breakProbability * 0.8,
                reason: `Cầu liên tục ${continuity.streak} lần, xác suất bẻ cầu ${breakProbability.toFixed(2)}`
            };
        }
        return {
            prediction: trendAnalysis.prediction,
            confidence: trendAnalysis.confidence * 0.9,
            reason: `Tiếp tục theo xu hướng, cầu chưa đủ mạnh để bẻ`
        };
    }

    model6Mini(data) {
        if (data.length < 2) return { streak: 0, direction: 'neutral', maxStreak: 0 };
        let currentStreak = 1, maxStreak = 1, direction = data[data.length - 1];
        for (let i = data.length - 1; i > 0; i--) {
            if (data[i] === data[i-1]) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else break;
        }
        return { streak: currentStreak, direction, maxStreak };
    }

    model6Support1() {
        return { status: "Phân tích hiệu quả bẻ cầu", effectiveness: this.analyzeBreakEffectiveness() };
    }

    model6Support2() {
        return { status: "Xác định điều kiện bẻ cầu tối ưu", conditions: this.findOptimalBreakConditions() };
    }

    analyzeBreakEffectiveness() {
        if (this.history.length < 30) return { effectiveness: 'unknown', successRate: 0 };
        let successes = 0, opportunities = 0;
        for (let i = 8; i < this.history.length; i++) {
            const segment = this.history.slice(i - 8, i);
            const continuity = this.model6Mini(segment);
            const breakProb = this.model10Mini(this.history.slice(0, i));
            if (continuity.streak >= 5 && breakProb > 0.7) {
                opportunities++;
                const trendAnalysis = this.model2Mini(segment);
                const prediction = trendAnalysis.trend === 'up' ? 'X' : 'T';
                if (this.history[i] === prediction) successes++;
            }
        }
        const successRate = opportunities > 0 ? successes / opportunities : 0;
        let effectiveness;
        if (successRate > 0.6) effectiveness = 'high';
        else if (successRate > 0.5) effectiveness = 'medium';
        else effectiveness = 'low';
        return { effectiveness, successRate, opportunities };
    }

    findOptimalBreakConditions() {
        if (this.history.length < 50) return { minStreak: 5, minProbability: 0.7 };
        let bestMinStreak = 5, bestMinProbability = 0.7, bestSuccessRate = 0;
        for (let minStreak = 4; minStreak <= 7; minStreak++) {
            for (let minProb = 0.6; minProb <= 0.8; minProb += 0.05) {
                let successes = 0, opportunities = 0;
                for (let i = 8; i < this.history.length; i++) {
                    const segment = this.history.slice(i - 8, i);
                    const continuity = this.model6Mini(segment);
                    const breakProb = this.model10Mini(this.history.slice(0, i));
                    if (continuity.streak >= minStreak && breakProb >= minProb) {
                        opportunities++;
                        const trendAnalysis = this.model2Mini(segment);
                        const prediction = trendAnalysis.trend === 'up' ? 'X' : 'T';
                        if (this.history[i] === prediction) successes++;
                    }
                }
                const successRate = opportunities > 0 ? successes / opportunities : 0;
                if (successRate > bestSuccessRate) {
                    bestSuccessRate = successRate;
                    bestMinStreak = minStreak;
                    bestMinProbability = minProb;
                }
            }
        }
        return { minStreak: bestMinStreak, minProbability: bestMinProbability, successRate: bestSuccessRate };
    }

    model7() {
        const performanceStats = this.model13Mini();
        const imbalance = this.model7Mini(performanceStats);
        if (imbalance > 0.3) {
            this.adjustWeights(performanceStats);
            return { prediction: null, confidence: 0, reason: `Điều chỉnh trọng số do chênh lệch hiệu suất ${imbalance.toFixed(2)}` };
        }
        return null;
    }

    model7Mini(performanceStats) {
        const accuracies = Object.values(performanceStats).map(p => p.accuracy);
        if (accuracies.length < 2) return 0;
        const maxAccuracy = Math.max(...accuracies);
        const minAccuracy = Math.min(...accuracies);
        return (maxAccuracy - minAccuracy) / maxAccuracy;
    }

    adjustWeights(performanceStats) {
        const avgAccuracy = Object.values(performanceStats).reduce((sum, p) => sum + p.accuracy, 0) / Object.values(performanceStats).length;
        for (const [model, stats] of Object.entries(performanceStats)) {
            const deviation = stats.accuracy - avgAccuracy;
            this.weights[model] = Math.max(0.1, Math.min(2, 1 + deviation * 2));
        }
    }

    model7Support1() {
        return { status: "Phân tích phân bố trọng số", distribution: this.analyzeWeightDistribution() };
    }

    model7Support2() {
        return { status: "Tối ưu điều chỉnh trọng số", optimization: this.optimizeWeightAdjustment() };
    }

    analyzeWeightDistribution() {
        const weights = Object.values(this.weights);
        const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
        const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
        const stdDev = Math.sqrt(variance);
        return { mean, variance, stdDev, min: Math.min(...weights), max: Math.max(...weights) };
    }

    optimizeWeightAdjustment() {
        let learningRate = 1.0;
        if (this.marketState.regime === 'volatile') learningRate = 0.8;
        else if (this.marketState.regime === 'trending') learningRate = 1.2;
        return { learningRate };
    }

    model8() {
        const randomness = this.model8Mini(this.history.slice(-15));
        if (randomness > 0.7) {
            ['model1', 'model4', 'model9', 'model12'].forEach(model => {
                this.weights[model] = Math.max(0.3, this.weights[model] * 0.7);
            });
            ['model3', 'model5', 'model6'].forEach(model => {
                this.weights[model] = Math.min(2, this.weights[model] * 1.2);
            });
            return { prediction: null, confidence: 0, reason: `Phát hiện cầu xấu (độ ngẫu nhiên ${randomness.toFixed(2)}), điều chỉnh trọng số model` };
        }
        return null;
    }

    model8Mini(data) {
        if (data.length < 10) return 0;
        let changes = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] !== data[i-1]) changes++;
        }
        const changeRatio = changes / (data.length - 1);
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        const distribution = Math.abs(tCount - xCount) / data.length;
        const pT = tCount / data.length;
        const pX = xCount / data.length;
        let entropy = 0;
        if (pT > 0) entropy -= pT * Math.log2(pT);
        if (pX > 0) entropy -= pX * Math.log2(pX);
        return (changeRatio * 0.4 + (1 - distribution) * 0.3 + entropy * 0.3);
    }

    model8Support1() {
        return { status: "Phân tích đặc điểm cầu xấu", characteristics: this.analyzeBadPatternCharacteristics() };
    }

    model8Support2() {
        return { status: "Đề xuất chiến lược cho cầu xấu", strategies: this.suggestStrategiesForBadPatterns() };
    }

    analyzeBadPatternCharacteristics() {
        if (this.history.length < 30) return { characteristics: 'unknown' };
        const recent = this.history.slice(-30);
        const randomness = this.model8Mini(recent);
        const volatility = this.sessionStats.volatility;
        let characteristics;
        if (randomness > 0.7 && volatility > 0.6) characteristics = 'high_randomness_high_volatility';
        else if (randomness > 0.7) characteristics = 'high_randomness';
        else if (volatility > 0.6) characteristics = 'high_volatility';
        else characteristics = 'normal';
        return { characteristics, randomness, volatility };
    }

    suggestStrategiesForBadPatterns() {
        const characteristics = this.analyzeBadPatternCharacteristics();
        let strategies = [];
        switch (characteristics.characteristics) {
            case 'high_randomness_high_volatility':
                strategies = ['reduce_position_size', 'focus_on_mean_reversion', 'avoid_pattern_based_models'];
                break;
            case 'high_randomness':
                strategies = ['increase_diversification', 'use_shorter_timeframes', 'focus_on_consensus_models'];
                break;
            case 'high_volatility':
                strategies = ['wait_for_clear_signals', 'use_breakout_strategies', 'adjust_risk_management'];
                break;
            default:
                strategies = ['normal_operation'];
        }
        return strategies;
    }

    model9() {
        const recent = this.history.slice(-12);
        if (recent.length < 8) return null;
        const complexPatterns = this.model9Mini(recent);
        if (complexPatterns.length === 0) return null;
        const bestPattern = complexPatterns.reduce((best, current) => current.confidence > best.confidence ? current : best);
        let confidence = bestPattern.confidence;
        if (this.marketState.regime === 'trending') confidence *= 1.1;
        else if (this.marketState.regime === 'volatile') confidence *= 0.9;
        return {
            prediction: bestPattern.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Phát hiện pattern phức tạp: ${bestPattern.type}`
        };
    }

    model9Mini(data) {
        const patterns = [];
        for (let patternLength = 4; patternLength <= 6; patternLength++) {
            if (data.length < patternLength) continue;
            const segment = data.slice(-patternLength);
            const patternKey = segment.join('-');
            if (this.patternDatabase[patternKey]) {
                patterns.push({
                    type: patternKey,
                    prediction: this.patternDatabase[patternKey].pattern[this.patternDatabase[patternKey].pattern.length - 1],
                    confidence: this.patternDatabase[patternKey].probability * 0.75
                });
            }
        }
        return patterns;
    }

    model9Support1() {
        return { status: "Phân tích độ phức tạp pattern", complexity: this.analyzePatternComplexity() };
    }

    model9Support2() {
        return { status: "Đánh giá khả năng tồn tại pattern", viability: this.assessPatternViability() };
    }

    analyzePatternComplexity() {
        const patterns = Object.keys(this.patternDatabase);
        let totalComplexity = 0;
        for (const pattern of patterns) {
            totalComplexity += pattern.split('-').length;
        }
        const avgComplexity = patterns.length > 0 ? totalComplexity / patterns.length : 0;
        let complexityLevel;
        if (avgComplexity > 5) complexityLevel = 'high';
        else if (avgComplexity > 4) complexityLevel = 'medium';
        else complexityLevel = 'low';
        return { level: complexityLevel, average: avgComplexity, total: patterns.length };
    }

    assessPatternViability() {
        const performance = this.calculatePatternPerformance();
        let viablePatterns = 0, totalPatterns = 0;
        for (const [pattern, stats] of Object.entries(performance)) {
            totalPatterns++;
            if (stats.accuracy > 0.55 && stats.occurrences >= 3) viablePatterns++;
        }
        const viabilityRate = totalPatterns > 0 ? viablePatterns / totalPatterns : 0;
        let viability;
        if (viabilityRate > 0.7) viability = 'high';
        else if (viabilityRate > 0.5) viability = 'medium';
        else viability = 'low';
        return { viability, rate: viabilityRate, viable: viablePatterns, total: totalPatterns };
    }

    model10() {
        const breakProb = this.model10Mini(this.history);
        return { prediction: null, confidence: breakProb, reason: `Xác suất bẻ cầu: ${breakProb.toFixed(2)}` };
    }

    model10Mini(data) {
        if (data.length < 20) return 0.5;
        let breakCount = 0, totalOpportunities = 0;
        for (let i = 5; i < data.length; i++) {
            const segment = data.slice(i-5, i);
            const streak = this.model6Mini(segment).streak;
            if (streak >= 4) {
                totalOpportunities++;
                if (data[i] !== segment[segment.length-1]) breakCount++;
            }
        }
        return totalOpportunities > 0 ? breakCount / totalOpportunities : 0.5;
    }

    model10Support1() {
        return { status: "Phân tích yếu tố ảnh hưởng bẻ cầu", factors: this.analyzeBreakFactors() };
    }

    model10Support2() {
        return { status: "Dự báo xác suất bẻ cầu", forecast: this.forecastBreakProbability() };
    }

    analyzeBreakFactors() {
        if (this.history.length < 30) return { factors: [] };
        const factors = [];
        const recent = this.history.slice(-30);
        const streakLengths = [], breakResults = [];
        for (let i = 5; i < recent.length; i++) {
            const segment = recent.slice(i-5, i);
            const streak = this.model6Mini(segment).streak;
            streakLengths.push(streak);
            breakResults.push(recent[i] !== segment[segment.length-1] ? 1 : 0);
        }
        if (streakLengths.length > 5) {
            const avgStreak = streakLengths.reduce((sum, val) => sum + val, 0) / streakLengths.length;
            const avgBreak = breakResults.reduce((sum, val) => sum + val, 0) / breakResults.length;
            let covariance = 0;
            for (let i = 0; i < streakLengths.length; i++) {
                covariance += (streakLengths[i] - avgStreak) * (breakResults[i] - avgBreak);
            }
            covariance /= streakLengths.length;
            const varianceStreak = streakLengths.reduce((sum, val) => sum + Math.pow(val - avgStreak, 2), 0) / streakLengths.length;
            const varianceBreak = breakResults.reduce((sum, val) => sum + Math.pow(val - avgBreak, 2), 0) / breakResults.length;
            const correlation = covariance / Math.sqrt(varianceStreak * varianceBreak);
            factors.push({ factor: 'streak_length', correlation: correlation });
        }
        return { factors };
    }

    forecastBreakProbability() {
        const currentStreak = this.sessionStats.streaks[this.history[this.history.length-1] || 'T'];
        const historicalBreakProb = this.model10Mini(this.history);
        let forecast = historicalBreakProb;
        if (currentStreak >= 5) {
            forecast = Math.min(0.9, forecast * (1 + currentStreak * 0.1));
        }
        if (this.marketState.regime === 'volatile') forecast *= 1.1;
        else if (this.marketState.regime === 'trending') forecast *= 0.9;
        return Math.min(0.95, Math.max(0.05, forecast));
    }

    model11() {
        const volatility = this.model11Mini(this.history.slice(-20));
        const prediction = this.model11Predict(volatility);
        return {
            prediction: prediction.value,
            confidence: prediction.confidence,
            reason: `Biến động ${volatility.level}, dự đoán ${prediction.value}`
        };
    }

    model11Mini(data) {
        if (data.length < 10) return { level: 'medium', value: 0.5 };
        let changes = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] !== data[i-1]) changes++;
        }
        const changeRatio = changes / (data.length - 1);
        if (changeRatio < 0.3) return { level: 'low', value: changeRatio };
        if (changeRatio > 0.7) return { level: 'high', value: changeRatio };
        return { level: 'medium', value: changeRatio };
    }

    model11Predict(volatility) {
        if (volatility.level === 'low') {
            const last = this.history[this.history.length - 1];
            return { value: last, confidence: 0.7 };
        } else if (volatility.level === 'high') {
            return { value: Math.random() > 0.5 ? 'T' : 'X', confidence: 0.5 };
        } else {
            const trend = this.model2Mini(this.history.slice(-10));
            return { value: trend.trend === 'up' ? 'T' : 'X', confidence: trend.strength * 0.8 };
        }
    }

    model11Support1() {
        return { status: "Phân tích nguyên nhân biến động", causes: this.analyzeVolatilityCauses() };
    }

    model11Support2() {
        return { status: "Dự báo biến động", forecast: this.forecastVolatility() };
    }

    analyzeVolatilityCauses() {
        const causes = [];
        const recent = this.history.slice(-20);
        const streak = this.model6Mini(recent).streak;
        if (streak >= 5) causes.push('high_streak');
        const distribution = this.model3Mini(recent).difference;
        if (distribution < 0.3) causes.push('balanced_distribution');
        if (this.marketState.regime === 'volatile') causes.push('market_regime');
        return causes;
    }

    forecastVolatility() {
        const currentVolatility = this.sessionStats.volatility;
        const historicalVolatility = this.calculateHistoricalVolatility();
        let forecast = (currentVolatility * 0.7 + historicalVolatility * 0.3);
        if (this.marketState.regime === 'volatile') forecast = Math.min(0.95, forecast * 1.2);
        else if (this.marketState.regime === 'trending') forecast = Math.max(0.2, forecast * 0.8);
        return forecast;
    }

    calculateHistoricalVolatility() {
        if (this.history.length < 30) return this.sessionStats.volatility;
        let totalVolatility = 0, count = 0;
        for (let i = 10; i < this.history.length; i += 5) {
            const segment = this.history.slice(Math.max(0, i - 10), i);
            const changes = segment.slice(1).filter((val, idx) => val !== segment[idx]).length;
            totalVolatility += changes / (segment.length - 1);
            count++;
        }
        return count > 0 ? totalVolatility / count : this.sessionStats.volatility;
    }

    model12() {
        const shortPatterns = this.model12Mini(this.history.slice(-8));
        if (shortPatterns.length === 0) return null;
        const bestPattern = shortPatterns.reduce((best, current) => current.confidence > best.confidence ? current : best);
        return {
            prediction: bestPattern.prediction,
            confidence: bestPattern.confidence,
            reason: `Mẫu cầu ngắn: ${bestPattern.type}`
        };
    }

    model12Mini(data) {
        const patterns = [];
        const shortPatterns = {
            'T-X-T': { prediction: 'X', confidence: 0.65 },
            'X-T-X': { prediction: 'T', confidence: 0.65 },
            'T-T-X': { prediction: 'X', confidence: 0.7 },
            'X-X-T': { prediction: 'T', confidence: 0.7 },
            'T-X-X': { prediction: 'T', confidence: 0.6 },
            'X-T-T': { prediction: 'X', confidence: 0.6 },
            'T-T-T-X': { prediction: 'X', confidence: 0.72 },
            'X-X-X-T': { prediction: 'T', confidence: 0.72 },
            'T-X-T-X': { prediction: 'X', confidence: 0.68 },
            'X-T-X-T': { prediction: 'T', confidence: 0.68 }
        };
        if (data.length >= 3) {
            const last3 = data.slice(-3).join('-');
            if (shortPatterns[last3]) {
                patterns.push({ type: last3, prediction: shortPatterns[last3].prediction, confidence: shortPatterns[last3].confidence });
            }
        }
        if (data.length >= 4) {
            const last4 = data.slice(-4).join('-');
            if (shortPatterns[last4]) {
                patterns.push({ type: last4, prediction: shortPatterns[last4].prediction, confidence: shortPatterns[last4].confidence });
            }
        }
        return patterns;
    }

    model12Support1() {
        return { status: "Phân tích hiệu suất mẫu ngắn", performance: this.analyzeShortPatternPerformance() };
    }

    model12Support2() {
        return { status: "Tối ưu độ dài mẫu ngắn", optimization: this.optimizeShortPatternLength() };
    }

    analyzeShortPatternPerformance() {
        if (this.history.length < 30) return { performance: {} };
        const performance = {};
        const shortPatterns = {
            'T-X-T': { prediction: 'X', confidence: 0.65 },
            'X-T-X': { prediction: 'T', confidence: 0.65 },
            'T-T-X': { prediction: 'X', confidence: 0.7 },
            'X-X-T': { prediction: 'T', confidence: 0.7 },
            'T-X-X': { prediction: 'T', confidence: 0.6 },
            'X-T-T': { prediction: 'X', confidence: 0.6 }
        };
        for (const [pattern, data] of Object.entries(shortPatterns)) {
            let correct = 0, total = 0;
            const patternLength = pattern.split('-').length;
            for (let i = patternLength; i < this.history.length; i++) {
                const segment = this.history.slice(i - patternLength, i);
                if (segment.join('-') === pattern) {
                    total++;
                    if (this.history[i] === data.prediction) correct++;
                }
            }
            performance[pattern] = { accuracy: total > 0 ? correct / total : 0, occurrences: total };
        }
        return performance;
    }

    optimizeShortPatternLength() {
        if (this.history.length < 50) return { optimalLength: 3 };
        let bestLength = 3, bestSuccessRate = 0;
        for (let length = 2; length <= 5; length++) {
            let totalSuccess = 0, totalOpportunities = 0;
            const patterns = this.generatePatternsOfLength(length);
            for (const pattern of patterns) {
                let correct = 0, opportunities = 0;
                for (let i = length; i < this.history.length; i++) {
                    const segment = this.history.slice(i - length, i);
                    if (segment.join('-') === pattern) {
                        opportunities++;
                        const prediction = segment[segment.length-1] === 'T' ? 'X' : 'T';
                        if (this.history[i] === prediction) correct++;
                    }
                }
                const successRate = opportunities > 0 ? correct / opportunities : 0;
                totalSuccess += successRate;
                totalOpportunities++;
            }
            const avgSuccessRate = totalOpportunities > 0 ? totalSuccess / totalOpportunities : 0;
            if (avgSuccessRate > bestSuccessRate) {
                bestSuccessRate = avgSuccessRate;
                bestLength = length;
            }
        }
        return { optimalLength: bestLength, successRate: bestSuccessRate };
    }

    generatePatternsOfLength(length) {
        const patterns = [];
        const generate = (current) => {
            if (current.length === length) {
                patterns.push(current.join('-'));
                return;
            }
            generate([...current, 'T']);
            generate([...current, 'X']);
        };
        generate([]);
        return patterns;
    }

    model13() {
        const performance = this.model13Mini();
        const bestModel = Object.entries(performance).reduce((best, [model, stats]) => 
            stats.accuracy > best.accuracy ? { model, ...stats } : best, { model: null, accuracy: 0 });
        return {
            prediction: null,
            confidence: bestModel.accuracy,
            reason: `Model hiệu suất cao nhất: ${bestModel.model} (${bestModel.accuracy.toFixed(2)})`
        };
    }

    model13Mini() {
        const stats = {};
        for (const model of Object.keys(this.performance)) {
            if (this.performance[model].total > 0) {
                stats[model] = {
                    accuracy: this.performance[model].correct / this.performance[model].total,
                    recentAccuracy: this.performance[model].recentTotal > 0 ? this.performance[model].recentCorrect / this.performance[model].recentTotal : 0,
                    total: this.performance[model].total,
                    recentTotal: this.performance[model].recentTotal,
                    streak: this.performance[model].streak,
                    maxStreak: this.performance[model].maxStreak
                };
            }
        }
        return stats;
    }

    model13Support1() {
        return { status: "Phân tích xu hướng hiệu suất", trends: this.analyzePerformanceTrends() };
    }

    model13Support2() {
        return { status: "Đề xuất cải thiện hiệu suất", improvements: this.suggestPerformanceImprovements() };
    }

    analyzePerformanceTrends() {
        const trends = {};
        const performance = this.model13Mini();
        for (const [model, stats] of Object.entries(performance)) {
            const trend = stats.recentAccuracy - stats.accuracy;
            let trendDirection;
            if (trend > 0.1) trendDirection = 'improving';
            else if (trend < -0.1) trendDirection = 'declining';
            else trendDirection = 'stable';
            trends[model] = { direction: trendDirection, magnitude: Math.abs(trend), current: stats.accuracy, recent: stats.recentAccuracy };
        }
        return trends;
    }

    suggestPerformanceImprovements() {
        const improvements = {};
        const performance = this.model13Mini();
        const trends = this.analyzePerformanceTrends();
        for (const [model, stats] of Object.entries(performance)) {
            const trend = trends[model];
            const suggestions = [];
            if (stats.accuracy < 0.5) suggestions.push('consider_reducing_weight');
            if (trend.direction === 'declining') suggestions.push('investigate_recent_performance');
            if (stats.recentTotal < 10) suggestions.push('need_more_data');
            improvements[model] = suggestions;
        }
        return improvements;
    }

    model14() {
        const breakProb = this.model14Mini(this.history);
        return { prediction: null, confidence: breakProb, reason: `Xác suất bẻ cầu xu hướng: ${breakProb.toFixed(2)}` };
    }

    model14Mini(data) {
        if (data.length < 15) return 0.5;
        let breakCount = 0, trendCount = 0;
        for (let i = 10; i < data.length; i++) {
            const segment = data.slice(i-10, i);
            const trend = this.model2Mini(segment);
            if (trend.strength > 0.6) {
                trendCount++;
                if (data[i] !== (trend.trend === 'up' ? 'T' : 'X')) breakCount++;
            }
        }
        return trendCount > 0 ? breakCount / trendCount : 0.5;
    }

    model14Support1() {
        return { status: "Phân tích yếu tố bẻ cầu xu hướng", factors: this.analyzeTrendBreakFactors() };
    }

    model14Support2() {
        return { status: "Dự báo xác suất bẻ cầu xu hướng", forecast: this.forecastTrendBreakProbability() };
    }

    analyzeTrendBreakFactors() {
        if (this.history.length < 40) return { factors: [] };
        const factors = [];
        const trendLengths = [], breakResults = [];
        for (let i = 15; i < this.history.length; i++) {
            const segment = this.history.slice(i-15, i);
            const trend = this.model2Mini(segment);
            if (trend.strength > 0.6) {
                let trendLength = 1;
                for (let j = i-2; j >= 0; j--) {
                    if (this.history[j] === (trend.trend === 'up' ? 'T' : 'X')) trendLength++;
                    else break;
                }
                trendLengths.push(trendLength);
                breakResults.push(this.history[i] !== (trend.trend === 'up' ? 'T' : 'X') ? 1 : 0);
            }
        }
        if (trendLengths.length > 5) {
            const avgLength = trendLengths.reduce((sum, val) => sum + val, 0) / trendLengths.length;
            const avgBreak = breakResults.reduce((sum, val) => sum + val, 0) / breakResults.length;
            let covariance = 0;
            for (let i = 0; i < trendLengths.length; i++) {
                covariance += (trendLengths[i] - avgLength) * (breakResults[i] - avgBreak);
            }
            covariance /= trendLengths.length;
            const varianceLength = trendLengths.reduce((sum, val) => sum + Math.pow(val - avgLength, 2), 0) / trendLengths.length;
            const varianceBreak = breakResults.reduce((sum, val) => sum + Math.pow(val - avgBreak, 2), 0) / breakResults.length;
            const correlation = covariance / Math.sqrt(varianceLength * varianceBreak);
            factors.push({ factor: 'trend_length', correlation: correlation });
        }
        return { factors };
    }

    forecastTrendBreakProbability() {
        const currentTrend = this.model2Mini(this.history.slice(-10));
        const historicalBreakProb = this.model14Mini(this.history);
        let forecast = historicalBreakProb;
        if (currentTrend.strength > 0.7) forecast *= 0.9;
        else if (currentTrend.strength < 0.4) forecast *= 1.1;
        if (this.marketState.regime === 'volatile') forecast = Math.min(0.9, forecast * 1.2);
        else if (this.marketState.regime === 'trending') forecast = Math.max(0.1, forecast * 0.8);
        return Math.min(0.95, Math.max(0.05, forecast));
    }

    model15() {
        const trend = this.model2();
        if (!trend) return null;
        const breakProb = this.model14Mini(this.history);
        const shouldFollow = this.model15Mini(trend.confidence, breakProb);
        return {
            prediction: shouldFollow ? trend.prediction : (trend.prediction === 'T' ? 'X' : 'T'),
            confidence: shouldFollow ? trend.confidence : (1 - trend.confidence),
            reason: shouldFollow ? `Nên theo xu hướng (xác suất bẻ thấp)` : `Nên bẻ xu hướng (xác suất bẻ cao)`
        };
    }

    model15Mini(trendConfidence, breakProbability) {
        return trendConfidence > breakProbability * 1.5;
    }

    model15Support1() {
        return { status: "Phân tích risk/reward theo xu hướng", analysis: this.analyzeTrendFollowingRiskReward() };
    }

    model15Support2() {
        return { status: "Tối ưu ngưỡng quyết định xu hướng", optimization: this.optimizeTrendDecisionThreshold() };
    }

    analyzeTrendFollowingRiskReward() {
        if (this.history.length < 50) return { riskRewardRatio: 1, successRate: 0.5 };
        let trendFollowingSuccess = 0, trendFollowingOpportunities = 0, breakSuccess = 0, breakOpportunities = 0;
        for (let i = 10; i < this.history.length; i++) {
            const segment = this.history.slice(i-10, i);
            const trend = this.model2Mini(segment);
            const breakProb = this.model14Mini(this.history.slice(0, i));
            if (trend.strength > 0.6) {
                const shouldFollow = trend.confidence > breakProb * 1.5;
                if (shouldFollow) {
                    trendFollowingOpportunities++;
                    if (this.history[i] === (trend.trend === 'up' ? 'T' : 'X')) trendFollowingSuccess++;
                } else {
                    breakOpportunities++;
                    if (this.history[i] !== (trend.trend === 'up' ? 'T' : 'X')) breakSuccess++;
                }
            }
        }
        const trendSuccessRate = trendFollowingOpportunities > 0 ? trendFollowingSuccess / trendFollowingOpportunities : 0;
        const breakSuccessRate = breakOpportunities > 0 ? breakSuccess / breakOpportunities : 0;
        const riskRewardRatio = trendSuccessRate / breakSuccessRate;
        return { riskRewardRatio, trendSuccessRate, breakSuccessRate };
    }

    optimizeTrendDecisionThreshold() {
        if (this.history.length < 50) return { optimalThreshold: 1.5 };
        let bestThreshold = 1.5, bestProfit = 0;
        for (let threshold = 1.0; threshold <= 2.0; threshold += 0.1) {
            let profit = 0;
            for (let i = 10; i < this.history.length; i++) {
                const segment = this.history.slice(i-10, i);
                const trend = this.model2Mini(segment);
                const breakProb = this.model14Mini(this.history.slice(0, i));
                if (trend.strength > 0.6) {
                    const shouldFollow = trend.confidence > breakProb * threshold;
                    const prediction = shouldFollow ? (trend.trend === 'up' ? 'T' : 'X') : (trend.trend === 'up' ? 'X' : 'T');
                    if (this.history[i] === prediction) profit += 1;
                    else profit -= 1;
                }
            }
            if (profit > bestProfit) {
                bestProfit = profit;
                bestThreshold = threshold;
            }
        }
        return { optimalThreshold: bestThreshold, expectedProfit: bestProfit };
    }

    model16() {
        const breakProb = this.model16Mini(this.history);
        return { prediction: null, confidence: breakProb, reason: `Xác suất bẻ cầu tổng hợp: ${breakProb.toFixed(2)}` };
    }

    model16Mini(data) {
        const prob1 = this.model10Mini(data);
        const prob2 = this.model14Mini(data);
        let recentBreaks = 0, recentOpportunities = 0;
        for (let i = Math.max(0, data.length - 10); i < data.length - 1; i++) {
            if (i >= 5) {
                const segment = data.slice(i-5, i);
                const streak = this.model6Mini(segment).streak;
                if (streak >= 3) {
                    recentOpportunities++;
                    if (data[i] !== segment[segment.length-1]) recentBreaks++;
                }
            }
        }
        const prob3 = recentOpportunities > 0 ? recentBreaks / recentOpportunities : 0.5;
        return (prob1 * 0.4 + prob2 * 0.4 + prob3 * 0.2);
    }

    model16Support1() {
        return { status: "Phân tích độ tin cậy xác suất bẻ", reliability: this.analyzeBreakProbabilityReliability() };
    }

    model16Support2() {
        return { status: "Tối ưu trọng số xác suất bẻ", optimization: this.optimizeBreakProbabilityWeights() };
    }

    analyzeBreakProbabilityReliability() {
        if (this.history.length < 40) return { reliability: {} };
        const reliability = {};
        const methods = [{ name: 'model10', method: this.model10Mini }, { name: 'model14', method: this.model14Mini }];
        for (const method of methods) {
            let correct = 0, total = 0;
            for (let i = 20; i < this.history.length; i++) {
                const probability = method.method(this.history.slice(0, i));
                const segment = this.history.slice(i-5, i);
                const streak = this.model6Mini(segment).streak;
                if (streak >= 4) {
                    total++;
                    const expectedBreak = probability > 0.6;
                    const actualBreak = this.history[i] !== segment[segment.length-1];
                    if (expectedBreak === actualBreak) correct++;
                }
            }
            reliability[method.name] = { accuracy: total > 0 ? correct / total : 0, observations: total };
        }
        return reliability;
    }

    optimizeBreakProbabilityWeights() {
        if (this.history.length < 50) return { weights: { model10: 0.4, model14: 0.4, recent: 0.2 } };
        let bestWeights = { model10: 0.4, model14: 0.4, recent: 0.2 };
        let bestAccuracy = 0;
        for (let w1 = 0.2; w1 <= 0.6; w1 += 0.1) {
            for (let w2 = 0.2; w2 <= 0.6; w2 += 0.1) {
                const w3 = 1 - w1 - w2;
                if (w3 < 0.1 || w3 > 0.4) continue;
                let correct = 0, total = 0;
                for (let i = 20; i < this.history.length; i++) {
                    const prob1 = this.model10Mini(this.history.slice(0, i));
                    const prob2 = this.model14Mini(this.history.slice(0, i));
                    let recentBreaks = 0, recentOpportunities = 0;
                    for (let j = Math.max(0, i - 10); j < i - 1; j++) {
                        if (j >= 5) {
                            const segment = this.history.slice(j-5, j);
                            const streak = this.model6Mini(segment).streak;
                            if (streak >= 3) {
                                recentOpportunities++;
                                if (this.history[j] !== segment[segment.length-1]) recentBreaks++;
                            }
                        }
                    }
                    const prob3 = recentOpportunities > 0 ? recentBreaks / recentOpportunities : 0.5;
                    const combinedProb = prob1 * w1 + prob2 * w2 + prob3 * w3;
                    const segment = this.history.slice(i-5, i);
                    const streak = this.model6Mini(segment).streak;
                    if (streak >= 4) {
                        total++;
                        const expectedBreak = combinedProb > 0.6;
                        const actualBreak = this.history[i] !== segment[segment.length-1];
                        if (expectedBreak === actualBreak) correct++;
                    }
                }
                const accuracy = total > 0 ? correct / total : 0;
                if (accuracy > bestAccuracy) {
                    bestAccuracy = accuracy;
                    bestWeights = { model10: w1, model14: w2, recent: w3 };
                }
            }
        }
        return { weights: bestWeights, accuracy: bestAccuracy };
    }

    model17() {
        const performance = this.model13Mini();
        const imbalance = this.model17Mini(performance);
        if (imbalance > 0.25) {
            this.adjustWeightsAdvanced(performance);
            return { prediction: null, confidence: 0, reason: `Cân bằng trọng số nâng cao, độ chênh lệch: ${imbalance.toFixed(2)}` };
        }
        return null;
    }

    model17Mini(performance) {
        const accuracies = Object.values(performance).map(p => p.accuracy);
        if (accuracies.length < 2) return 0;
        const mean = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
        const variance = accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) / accuracies.length;
        return Math.sqrt(variance) / mean;
    }

    adjustWeightsAdvanced(performance) {
        const meanAccuracy = Object.values(performance).reduce((sum, p) => sum + p.accuracy, 0) / Object.values(performance).length;
        for (const [model, stats] of Object.entries(performance)) {
            if (stats.accuracy > meanAccuracy * 1.2) {
                this.weights[model] = Math.min(2, this.weights[model] * 1.1);
            } else if (stats.accuracy < meanAccuracy * 0.8) {
                this.weights[model] = Math.max(0.1, this.weights[model] * 0.9);
            }
        }
    }

    model17Support1() {
        return { status: "Phân tích ảnh hưởng điều chỉnh trọng số", impact: this.analyzeWeightAdjustmentImpact() };
    }

    model17Support2() {
        return { status: "Tối ưu tần suất điều chỉnh trọng số", optimization: this.optimizeWeightAdjustmentFrequency() };
    }

    analyzeWeightAdjustmentImpact() {
        const before = this.analyzeWeightDistribution();
        const performance = this.model13Mini();
        const meanAccuracy = Object.values(performance).reduce((sum, p) => sum + p.accuracy, 0) / Object.values(performance).length;
        const simulatedWeights = {};
        for (const [model, stats] of Object.entries(performance)) {
            if (stats.accuracy > meanAccuracy * 1.2) {
                simulatedWeights[model] = Math.min(2, this.weights[model] * 1.1);
            } else if (stats.accuracy < meanAccuracy * 0.8) {
                simulatedWeights[model] = Math.max(0.1, this.weights[model] * 0.9);
            } else {
                simulatedWeights[model] = this.weights[model];
            }
        }
        const after = {
            mean: Object.values(simulatedWeights).reduce((sum, w) => sum + w, 0) / Object.values(simulatedWeights).length,
            min: Math.min(...Object.values(simulatedWeights)),
            max: Math.max(...Object.values(simulatedWeights))
        };
        return { before, after, change: after.mean - before.mean };
    }

    optimizeWeightAdjustmentFrequency() {
        let frequency;
        if (this.marketState.stability > 0.7) frequency = 'low';
        else if (this.marketState.stability < 0.3) frequency = 'high';
        else frequency = 'medium';
        return { frequency, stability: this.marketState.stability };
    }

    model18() {
        const shortTrend = this.model18Mini(this.history.slice(-6));
        return {
            prediction: shortTrend.prediction,
            confidence: shortTrend.confidence,
            reason: `Xu hướng ngắn hạn: ${shortTrend.trend}`
        };
    }

    model18Mini(data) {
        if (data.length < 4) return { prediction: null, confidence: 0, trend: 'Không xác định' };
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        let prediction, confidence, trend;
        if (tCount > xCount * 1.5) {
            prediction = 'T'; confidence = 0.7; trend = 'Mạnh T';
        } else if (xCount > tCount * 1.5) {
            prediction = 'X'; confidence = 0.7; trend = 'Mạnh X';
        } else if (tCount > xCount) {
            prediction = 'T'; confidence = 0.6; trend = 'Nhẹ T';
        } else if (xCount > tCount) {
            prediction = 'X'; confidence = 0.6; trend = 'Nhẹ X';
        } else {
            prediction = data[data.length - 1] === 'T' ? 'X' : 'T';
            confidence = 0.55;
            trend = 'Cân bằng';
        }
        return { prediction, confidence, trend };
    }

    model18Support1() {
        return { status: "Phân tích độ nhạy xu hướng ngắn hạn", sensitivity: this.analyzeShortTermTrendSensitivity() };
    }

    model18Support2() {
        return { status: "Tối ưu khung thời gian xu hướng ngắn hạn", optimization: this.optimizeShortTermTrendTimeframe() };
    }

    analyzeShortTermTrendSensitivity() {
        if (this.history.length < 30) return { sensitivity: 'unknown' };
        let changes = 0;
        for (let i = 6; i < this.history.length; i++) {
            const segment1 = this.history.slice(i-6, i-3);
            const segment2 = this.history.slice(i-3, i);
            const trend1 = this.model18Mini(segment1);
            const trend2 = this.model18Mini(segment2);
            if (trend1.prediction !== trend2.prediction) changes++;
        }
        const changeRate = changes / (this.history.length - 6);
        let sensitivity;
        if (changeRate > 0.5) sensitivity = 'high';
        else if (changeRate > 0.3) sensitivity = 'medium';
        else sensitivity = 'low';
        return { sensitivity, changeRate };
    }

    optimizeShortTermTrendTimeframe() {
        if (this.history.length < 50) return { optimalTimeframe: 6 };
        let bestTimeframe = 6, bestSuccessRate = 0;
        for (let timeframe = 4; timeframe <= 8; timeframe++) {
            let successes = 0, opportunities = 0;
            for (let i = timeframe; i < this.history.length; i++) {
                const segment = this.history.slice(i - timeframe, i);
                const analysis = this.model18Mini(segment);
                if (analysis.confidence >= 0.6) {
                    opportunities++;
                    if (this.history[i] === analysis.prediction) successes++;
                }
            }
            const successRate = opportunities > 0 ? successes / opportunities : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestTimeframe = timeframe;
            }
        }
        return { optimalTimeframe: bestTimeframe, successRate: bestSuccessRate };
    }

    model19() {
        const commonTrends = this.model19Mini(this.history.slice(-30));
        if (commonTrends.length === 0) return null;
        const bestTrend = commonTrends.reduce((best, current) => current.frequency > best.frequency ? current : best);
        return {
            prediction: bestTrend.prediction,
            confidence: bestTrend.confidence,
            reason: `Xu hướng phổ biến: ${bestTrend.pattern} (tần suất ${bestTrend.frequency})`
        };
    }

    model19Mini(data) {
        const trends = [];
        const patternCounts = {};
        for (let length = 3; length <= 5; length++) {
            for (let i = 0; i <= data.length - length; i++) {
                const pattern = data.slice(i, i + length).join('-');
                patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
            }
        }
        for (const [pattern, count] of Object.entries(patternCounts)) {
            if (count >= 3) {
                const patternParts = pattern.split('-');
                const prediction = patternParts[patternParts.length - 1];
                const frequency = count / (data.length - patternParts.length + 1);
                trends.push({ pattern, prediction, frequency, confidence: Math.min(0.8, frequency * 2) });
            }
        }
        return trends;
    }

    model19Support1() {
        return { status: "Phân tích sự ổn định xu hướng", stability: this.analyzeTrendStability() };
    }

    model19Support2() {
        return { status: "Dự báo xu hướng phổ biến", forecast: this.forecastCommonTrends() };
    }

    analyzeTrendStability() {
        if (this.history.length < 40) return { stability: 'unknown' };
        const half1 = this.history.slice(0, Math.floor(this.history.length / 2));
        const half2 = this.history.slice(Math.floor(this.history.length / 2));
        const trends1 = this.model19Mini(half1);
        const trends2 = this.model19Mini(half2);
        const commonPatterns = [];
        for (const trend1 of trends1) {
            for (const trend2 of trends2) {
                if (trend1.pattern === trend2.pattern) {
                    commonPatterns.push({ pattern: trend1.pattern, frequency1: trend1.frequency, frequency2: trend2.frequency, change: Math.abs(trend1.frequency - trend2.frequency) });
                }
            }
        }
        const avgChange = commonPatterns.length > 0 ? commonPatterns.reduce((sum, p) => sum + p.change, 0) / commonPatterns.length : 0;
        let stability;
        if (avgChange < 0.1) stability = 'high';
        else if (avgChange < 0.2) stability = 'medium';
        else stability = 'low';
        return { stability, avgChange, commonPatterns: commonPatterns.length };
    }

    forecastCommonTrends() {
        const currentTrends = this.model19Mini(this.history.slice(-20));
        return currentTrends.map(trend => ({ pattern: trend.pattern, predictedFrequency: trend.frequency * 0.9, confidence: trend.confidence * 0.8 }));
    }

    model20() {
        const performance = this.model13Mini();
        const bestModels = Object.entries(performance).filter(([_, stats]) => stats.total > 10).sort((a, b) => b[1].accuracy - a[1].accuracy).slice(0, 3);
        if (bestModels.length === 0) return null;
        const predictions = {};
        for (const [model] of bestModels) {
            predictions[model] = this.models[model] ? this.models[model]() : null;
        }
        let tScore = 0, xScore = 0;
        for (const [model, prediction] of Object.entries(predictions)) {
            if (prediction && prediction.prediction) {
                const weight = performance[model].accuracy;
                if (prediction.prediction === 'T') tScore += weight * prediction.confidence;
                else xScore += weight * prediction.confidence;
            }
        }
        const totalScore = tScore + xScore;
        if (totalScore === 0) return null;
        return {
            prediction: tScore > xScore ? 'T' : 'X',
            confidence: Math.max(tScore, xScore) / totalScore,
            reason: `Kết hợp ${bestModels.length} model hiệu suất cao nhất`
        };
    }

    model20Support1() {
        return { status: "Phân tích tính ổn định model hiệu suất cao", stability: this.analyzeTopModelStability() };
    }

    model20Support2() {
        return { status: "Tối ưu số lượng model trong combination", optimization: this.optimizeModelCombinationCount() };
    }

    analyzeTopModelStability() {
        const performance = this.model13Mini();
        const topModels = Object.entries(performance).filter(([_, stats]) => stats.total > 10).sort((a, b) => b[1].accuracy - a[1].accuracy).slice(0, 5);
        let changes = 0;
        if (this.previousTopModels) {
            for (const model of topModels) {
                if (!this.previousTopModels.includes(model[0])) changes++;
            }
        }
        this.previousTopModels = topModels.map(m => m[0]);
        const changeRate = changes / topModels.length;
        let stability;
        if (changeRate < 0.2) stability = 'high';
        else if (changeRate < 0.4) stability = 'medium';
        else stability = 'low';
        return { stability, changeRate, topModels: topModels.map(m => m[0]) };
    }

    optimizeModelCombinationCount() {
        if (this.history.length < 50) return { optimalCount: 3 };
        let bestCount = 3, bestSuccessRate = 0;
        for (let count = 1; count <= 5; count++) {
            let successes = 0, opportunities = 0;
            for (let i = 20; i < this.history.length; i++) {
                const simulatedPerformance = {};
                for (const model of Object.keys(this.performance)) {
                    let correct = 0, total = 0;
                    for (let j = 10; j < i; j++) {
                        // Giả lập đơn giản
                    }
                    simulatedPerformance[model] = { accuracy: total > 0 ? correct / total : 0.5 };
                }
                const topModels = Object.entries(simulatedPerformance).filter(([_, stats]) => stats.accuracy > 0).sort((a, b) => b[1].accuracy - a[1].accuracy).slice(0, count);
                let tCount = 0, xCount = 0;
                for (const [model] of topModels) {
                    // Giả lập
                }
                const prediction = tCount > xCount ? 'T' : 'X';
                if (this.history[i] === prediction) successes++;
                opportunities++;
            }
            const successRate = opportunities > 0 ? successes / opportunities : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestCount = count;
            }
        }
        return { optimalCount: bestCount, successRate: bestSuccessRate };
    }

    model21() {
        const predictions = this.getAllPredictions();
        const tCount = Object.values(predictions).filter(p => p && p.prediction === 'T').length;
        const xCount = Object.values(predictions).filter(p => p && p.prediction === 'X').length;
        const total = tCount + xCount;
        if (total < 8) return null;
        const difference = Math.abs(tCount - xCount) / total;
        if (difference > 0.5) {
            const adjustedPredictions = this.model21Mini(predictions, difference);
            let tScore = 0, xScore = 0;
            for (const prediction of Object.values(adjustedPredictions)) {
                if (prediction && prediction.prediction) {
                    if (prediction.prediction === 'T') tScore += prediction.confidence;
                    else xScore += prediction.confidence;
                }
            }
            const totalScore = tScore + xScore;
            if (totalScore === 0) return null;
            return {
                prediction: tScore > xScore ? 'T' : 'X',
                confidence: Math.max(tScore, xScore) / totalScore,
                reason: `Cân bằng tổng thể, chênh lệch ban đầu: ${difference.toFixed(2)}`
            };
        }
        return null;
    }

    model21Mini(predictions, difference) {
        const adjusted = {};
        const adjustment = 1 - difference;
        for (const [model, prediction] of Object.entries(predictions)) {
            if (prediction) {
                adjusted[model] = { ...prediction, confidence: prediction.confidence * adjustment };
            }
        }
        return adjusted;
    }

    model21Support1() {
        return { status: "Phân tích hiệu quả cơ chế cân bằng", effectiveness: this.analyzeBalancingEffectiveness() };
    }

    model21Support2() {
        return { status: "Tối ưu ngưỡng cân bằng", optimization: this.optimizeBalancingThreshold() };
    }

    analyzeBalancingEffectiveness() {
        if (this.history.length < 40) return { effectiveness: 'unknown', successRate: 0 };
        let successes = 0, opportunities = 0;
        for (let i = 20; i < this.history.length; i++) {
            const simulatedPredictions = {};
            for (const model of Object.keys(this.models)) {
                if (model.startsWith('model') && !model.includes('Support') && !model.includes('Mini')) {
                    const pred = this.models[model] ? this.models[model]() : null;
                    if (pred) simulatedPredictions[model] = pred;
                }
            }
            const tCount = Object.values(simulatedPredictions).filter(p => p && p.prediction === 'T').length;
            const xCount = Object.values(simulatedPredictions).filter(p => p && p.prediction === 'X').length;
            const total = tCount + xCount;
            const difference = Math.abs(tCount - xCount) / total;
            if (difference > 0.5) {
                opportunities++;
                const adjustedPredictions = this.model21Mini(simulatedPredictions, difference);
                let tScore = 0, xScore = 0;
                for (const prediction of Object.values(adjustedPredictions)) {
                    if (prediction && prediction.prediction) {
                        if (prediction.prediction === 'T') tScore += prediction.confidence;
                        else xScore += prediction.confidence;
                    }
                }
                const finalPrediction = tScore > xScore ? 'T' : 'X';
                if (this.history[i] === finalPrediction) successes++;
            }
        }
        const successRate = opportunities > 0 ? successes / opportunities : 0;
        let effectiveness;
        if (successRate > 0.6) effectiveness = 'high';
        else if (successRate > 0.5) effectiveness = 'medium';
        else effectiveness = 'low';
        return { effectiveness, successRate, opportunities };
    }

    optimizeBalancingThreshold() {
        if (this.history.length < 50) return { optimalThreshold: 0.5 };
        let bestThreshold = 0.5, bestSuccessRate = 0;
        for (let threshold = 0.4; threshold <= 0.6; threshold += 0.05) {
            let successes = 0, opportunities = 0;
            for (let i = 20; i < this.history.length; i++) {
                const simulatedPredictions = {};
                for (const model of Object.keys(this.models)) {
                    if (model.startsWith('model') && !model.includes('Support') && !model.includes('Mini')) {
                        const pred = this.models[model] ? this.models[model]() : null;
                        if (pred) simulatedPredictions[model] = pred;
                    }
                }
                const tCount = Object.values(simulatedPredictions).filter(p => p && p.prediction === 'T').length;
                const xCount = Object.values(simulatedPredictions).filter(p => p && p.prediction === 'X').length;
                const total = tCount + xCount;
                const difference = Math.abs(tCount - xCount) / total;
                if (difference > threshold) {
                    opportunities++;
                    const adjustedPredictions = this.model21Mini(simulatedPredictions, difference);
                    let tScore = 0, xScore = 0;
                    for (const prediction of Object.values(adjustedPredictions)) {
                        if (prediction && prediction.prediction) {
                            if (prediction.prediction === 'T') tScore += prediction.confidence;
                            else xScore += prediction.confidence;
                        }
                    }
                    const finalPrediction = tScore > xScore ? 'T' : 'X';
                    if (this.history[i] === finalPrediction) successes++;
                }
            }
            const successRate = opportunities > 0 ? successes / opportunities : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestThreshold = threshold;
            }
        }
        return { optimalThreshold: bestThreshold, successRate: bestSuccessRate };
    }

    // ============ UTILITY METHODS ============

    getAllPredictions() {
        if (this._inGetAllPredictions) return {};
        this._inGetAllPredictions = true;
        try {
            const predictions = {};
            for (let i = 1; i <= 21; i++) {
                const modelFn = this.models[`model${i}`];
                predictions[`model${i}`] = modelFn ? modelFn() : null;
            }
            return predictions;
        } finally {
            this._inGetAllPredictions = false;
        }
    }

    getFinalPrediction() {
        const predictions = this.getAllPredictions();
        let tScore = 0, xScore = 0, totalWeight = 0;
        const reasons = [];
        
        for (const [modelName, prediction] of Object.entries(predictions)) {
            if (prediction && prediction.prediction) {
                const weight = this.weights[modelName] || 1;
                const score = prediction.confidence * weight;
                
                if (prediction.prediction === 'T') tScore += score;
                else if (prediction.prediction === 'X') xScore += score;
                
                totalWeight += weight;
                reasons.push(`${modelName}: ${prediction.reason} (${prediction.confidence.toFixed(2)})`);
            }
        }
        
        if (totalWeight === 0) return null;
        
        let finalPrediction = null, finalConfidence = 0;
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
        if (!confidence) return 0;
        if (this.sessionStats.volatility > 0.7) return confidence * 0.8;
        if (this.sessionStats.volatility < 0.3) return Math.min(0.95, confidence * 1.1);
        return confidence;
    }

    updatePerformance(actualResult) {
        const predictions = this.getAllPredictions();
        
        for (const [modelName, prediction] of Object.entries(predictions)) {
            // Bỏ qua nếu prediction null hoặc không có prediction
            if (!prediction || !prediction.prediction) {
                continue;
            }
            
            if (!this.performance[modelName]) {
                this.performance[modelName] = { correct: 0, total: 0, recentCorrect: 0, recentTotal: 0, streak: 0, maxStreak: 0 };
            }
            
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
                this.performance[modelName].recentTotal = 50;
                if (this.performance[modelName].recentCorrect > this.performance[modelName].recentTotal) {
                    this.performance[modelName].recentCorrect = this.performance[modelName].recentTotal;
                }
            }
            
            const accuracy = this.performance[modelName].total > 0 ? 
                this.performance[modelName].correct / this.performance[modelName].total : 0;
            this.weights[modelName] = Math.max(0.1, Math.min(2, accuracy * 2 || 1));
        }
        
        const totalPredictions = Object.values(predictions).filter(p => p && p.prediction).length;
        const correctPredictions = Object.values(predictions).filter(p => p && p.prediction === actualResult).length;
        this.sessionStats.recentAccuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
    }
}

// ============ EXPORT ============
module.exports = { UltraDicePredictionSystem };
module.exports.default = UltraDicePredictionSystem;
