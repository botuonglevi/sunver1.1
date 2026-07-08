// ============================================
// FILE: thuattoan.js - FIX VERSION
// FIX: Lỗi null prediction + apiData.map
// ============================================

// THÊM CÁC HELPER FUNCTION VÀO ĐẦU CLASS:

const safeGetPrediction = (pred) => {
    // Fix lỗi: Cannot read properties of null (reading 'prediction')
    if (!pred || typeof pred !== 'object') return null;
    return pred.prediction || null;
};

const normalizeApiData = (data) => {
    // Fix lỗi: apiData.map is not a function
    // Nếu API trả về object đơn, chuyển thành array
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        // Nếu là object có results property
        if (Array.isArray(data.results)) return data.results;
        // Nếu là object có data property
        if (Array.isArray(data.data)) return data.data;
        // Nếu là object đơn, bọc vào array
        return [data];
    }
    return [];
};

const safeMapPredictions = (apiData) => {
    // SAFE VERSION để tránh lỗi apiData.map
    const normalized = normalizeApiData(apiData);
    return normalized.map(item => {
        // Kiểm tra null trước khi access properties
        if (!item) return null;
        return {
            prediction: item.prediction || null,
            confidence: item.confidence || 0,
            reason: item.reason || 'unknown'
        };
    }).filter(p => p !== null);
};

// ============================================
// FIX TRONG CLASS - CẬP NHẬT NHỮNG METHOD NÀY:
// ============================================

// Method 1: FIX trong getAllPredictions
getAllPredictions() {
    if (this._inGetAllPredictions) return {};
    this._inGetAllPredictions = true;
    try {
        const predictions = {};
        for (let i = 1; i <= 21; i++) {
            const modelFn = this.models[`model${i}`];
            const pred = modelFn ? modelFn() : null;
            // FIX: Kiểm tra null trước khi gán
            if (pred && typeof pred === 'object' && pred.prediction) {
                predictions[`model${i}`] = pred;
            }
        }
        return predictions;
    } catch (err) {
        console.error('Error in getAllPredictions:', err);
        return {};
    } finally {
        this._inGetAllPredictions = false;
    }
}

// Method 2: FIX trong getFinalPrediction
getFinalPrediction() {
    const predictions = this.getAllPredictions();
    let tScore = 0, xScore = 0, totalWeight = 0;
    const reasons = [];
    
    for (const [modelName, prediction] of Object.entries(predictions)) {
        // FIX: Kiểm kỹ trước access .prediction
        if (prediction && typeof prediction === 'object' && prediction.prediction) {
            const weight = this.weights[modelName] || 1;
            const score = (prediction.confidence || 0) * weight;
            
            if (prediction.prediction === 'T') tScore += score;
            else if (prediction.prediction === 'X') xScore += score;
            
            totalWeight += weight;
            const confValue = prediction.confidence ? prediction.confidence.toFixed(2) : '0.00';
            reasons.push(`${modelName}: ${prediction.reason || 'N/A'} (${confValue})`);
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

// Method 3: FIX trong updatePerformance
updatePerformance(actualResult) {
    if (!actualResult) return; // FIX: Kiểm tra actualResult không null
    
    const predictions = this.getAllPredictions();
    
    for (const [modelName, prediction] of Object.entries(predictions)) {
        // FIX: Kiểm kỹ hơn
        if (!prediction || typeof prediction !== 'object' || !prediction.prediction) {
            continue;
        }
        
        if (!this.performance[modelName]) {
            this.performance[modelName] = { 
                correct: 0, 
                total: 0, 
                recentCorrect: 0, 
                recentTotal: 0, 
                streak: 0, 
                maxStreak: 0 
            };
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

// Method 4: FIX learnFromAPI (thêm mới nếu chưa có)
learnFromAPI(apiData) {
    try {
        if (!apiData) {
            console.warn('API data is null or undefined');
            return { success: false, message: 'No API data' };
        }
        
        // FIX: Normalize dữ liệu API trước khi dùng .map()
        const normalized = normalizeApiData(apiData);
        
        if (!Array.isArray(normalized) || normalized.length === 0) {
            console.warn('API data is not array or empty', typeof apiData);
            return { success: false, message: 'Invalid API data format' };
        }
        
        // Xử lý dữ liệu safely
        let learned = 0;
        for (const item of normalized) {
            if (!item || !item.history || !Array.isArray(item.history)) {
                continue; // Skip item không hợp lệ
            }
            
            // Thêm vào history
            for (const result of item.history) {
                if (result && (result === 'T' || result === 'X')) {
                    this.history.push(result);
                    learned++;
                }
            }
        }
        
        return { 
            success: learned > 0, 
            message: `Learned ${learned} results from API`,
            count: learned 
        };
    } catch (err) {
        console.error('Error in learnFromAPI:', err);
        return { success: false, message: err.message };
    }
}

// Method 5: FIX trong model21
model21() {
    try {
        const predictions = this.getAllPredictions();
        const validPreds = Object.values(predictions).filter(p => {
            // FIX: Kiểm tra null carefully
            return p && typeof p === 'object' && p.prediction;
        });
        
        const tCount = validPreds.filter(p => p.prediction === 'T').length;
        const xCount = validPreds.filter(p => p.prediction === 'X').length;
        const total = tCount + xCount;
        
        if (total < 8) return null;
        
        const difference = Math.abs(tCount - xCount) / total;
        if (difference > 0.5) {
            const adjustedPredictions = this.model21Mini(predictions, difference);
            let tScore = 0, xScore = 0;
            
            for (const prediction of Object.values(adjustedPredictions)) {
                // FIX: Kiểm tra null
                if (prediction && typeof prediction === 'object' && prediction.prediction) {
                    if (prediction.prediction === 'T') tScore += (prediction.confidence || 0);
                    else xScore += (prediction.confidence || 0);
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
    } catch (err) {
        console.error('Error in model21:', err);
        return null;
    }
}

// ============================================
// TÓMSUMMARY CÁC FIX:
// ============================================
/*
✅ FIX 1: Kiểm tra null/undefined TRƯỚC khi access .prediction
   - if (prediction && typeof prediction === 'object' && prediction.prediction)
   
✅ FIX 2: Normalize API data để tránh lỗi .map()
   - normalizeApiData() chuyển object thành array
   - Kiểm tra Array.isArray() trước .map()
   
✅ FIX 3: Thêm try-catch error handling
   - Bắt lỗi runtime để debug dễ hơn
   
✅ FIX 4: Kiểm tra kiểu dữ liệu (typeof)
   - Không chỉ null check, mà check cả kiểu object
   
✅ FIX 5: Safe property access
   - Dùng (prediction.confidence || 0) thay vì prediction.confidence
*/
