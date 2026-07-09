// ============================================
// FILE: index.js - Ứng dụng chính
// Hệ thống dự đoán xúc xắc
// ============================================

const fs = require('fs');
const path = require('path');
const { UltraDicePredictionSystem } = require('./thuattoan-fix.js');

// Cấu hình
const CONFIG = {
    API_URL: 'http://fi8.bot-hosting.net:20692/api/his',
    DATA_FILE: 'history_data.json',
    MODEL_FILE: 'model_state.json',
    LEARN_EPOCHS: 1,
    BATCH_SIZE: 100,
    SHOW_PROGRESS: true,
    MAX_HISTORY: 10000
};

// ============ QUẢN LÝ DỮ LIỆU ============

class DataManager {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    saveHistory(data, filename = CONFIG.DATA_FILE) {
        const filepath = path.join(this.dataDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        return filepath;
    }

    loadHistory(filename = CONFIG.DATA_FILE) {
        const filepath = path.join(this.dataDir, filename);
        if (fs.existsSync(filepath)) {
            try {
                const data = fs.readFileSync(filepath, 'utf8');
                return JSON.parse(data);
            } catch (e) {
                console.error('❌ Lỗi đọc file history:', e.message);
                return null;
            }
        }
        return null;
    }

    saveModelState(system, filename = CONFIG.MODEL_FILE) {
        const state = {
            history: system.history,
            weights: system.weights,
            performance: system.performance,
            patternDatabase: system.patternDatabase,
            sessionStats: system.sessionStats,
            marketState: system.marketState,
            adaptiveParameters: system.adaptiveParameters,
            savedAt: new Date().toISOString(),
            totalSessions: system.history.length
        };
        const filepath = path.join(this.dataDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
        return filepath;
    }

    loadModelState(system, filename = CONFIG.MODEL_FILE) {
        const filepath = path.join(this.dataDir, filename);
        if (fs.existsSync(filepath)) {
            try {
                const data = fs.readFileSync(filepath, 'utf8');
                const state = JSON.parse(data);
                
                system.history = state.history || [];
                system.weights = state.weights || {};
                system.performance = state.performance || {};
                system.patternDatabase = state.patternDatabase || {};
                system.sessionStats = state.sessionStats || {};
                system.marketState = state.marketState || {};
                system.adaptiveParameters = state.adaptiveParameters || {};
                
                return state;
            } catch (e) {
                console.error('❌ Lỗi đọc file model:', e.message);
                return null;
            }
        }
        return null;
    }

    async fetchNewData(apiUrl) {
        try {
            const fetch = require('node-fetch');
            console.log(`🌐 Đang gọi API: ${apiUrl}`);
            
            const response = await fetch(apiUrl, {
                timeout: 30000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data) {
                console.error('❌ API trả về null/undefined');
                return null;
            }

            console.log(`📊 Loại dữ liệu: ${typeof data}`);
            
            let result = data;
            
            if (typeof data === 'object' && !Array.isArray(data)) {
                console.log('📦 Đang tìm mảng dữ liệu...');
                
                const possibleKeys = ['data', 'results', 'items', 'list', 'history', 'records', 'rows', 'Data', 'Result'];
                let foundArray = null;
                
                for (const key of possibleKeys) {
                    if (data[key] && Array.isArray(data[key])) {
                        foundArray = data[key];
                        console.log(`✅ Tìm thấy mảng tại key: "${key}" (${foundArray.length} phần tử)`);
                        break;
                    }
                }
                
                if (!foundArray) {
                    for (const key of Object.keys(data)) {
                        if (Array.isArray(data[key]) && data[key].length > 0) {
                            foundArray = data[key];
                            console.log(`✅ Tìm thấy mảng tại key: "${key}" (${foundArray.length} phần tử)`);
                            break;
                        }
                    }
                }
                
                result = foundArray || [];
            }
            
            if (!Array.isArray(result)) {
                console.error('❌ Dữ liệu không phải mảng');
                return [];
            }
            
            console.log(`📊 API trả về ${result.length} phiên`);
            
            if (result.length > 0) {
                const sample = result[0];
                console.log(`📋 Mẫu:`, JSON.stringify(sample).substring(0, 300));
                
                result = result.map((item, index) => {
                    const normalized = { ...item };
                    
                    if (!normalized.index && !normalized.phien) {
                        normalized.index = index + 1;
                    }
                    
                    const ketQua = normalized.ket_qua || normalized.result || normalized.Result || '';
                    
                    if (typeof ketQua === 'string') {
                        const lower = ketQua.toLowerCase();
                        if (lower.includes('tài') || lower.includes('tai')) {
                            normalized.result = 'T';
                        } else if (lower.includes('xỉu') || lower.includes('xiu')) {
                            normalized.result = 'X';
                        } else {
                            const upper = ketQua.toUpperCase();
                            if (upper === 'T' || upper === 'TAI') {
                                normalized.result = 'T';
                            } else if (upper === 'X' || upper === 'XIU') {
                                normalized.result = 'X';
                            } else {
                                normalized.result = ketQua;
                            }
                        }
                    }
                    
                    return normalized;
                });
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Lỗi fetch API:', error.message);
            return null;
        }
    }

    getNewSessions(oldData, newData) {
        if (!oldData || oldData.length === 0) {
            return newData;
        }

        if (!newData || newData.length === 0) {
            return [];
        }

        let lastOldIndex = 0;
        if (oldData.length > 0) {
            const lastItem = oldData[oldData.length - 1];
            lastOldIndex = lastItem?.phien || lastItem?.index || lastItem?.id || 0;
        }

        const newSessions = newData.filter(item => {
            const currentIndex = item?.phien || item?.index || item?.id || 0;
            return currentIndex > lastOldIndex;
        });

        return newSessions;
    }

    mergeHistory(oldData, newSessions) {
        if (!oldData || oldData.length === 0) {
            return newSessions || [];
        }
        if (!newSessions || newSessions.length === 0) {
            return oldData;
        }
        
        const merged = [...oldData, ...newSessions];
        if (merged.length > CONFIG.MAX_HISTORY) {
            return merged.slice(-CONFIG.MAX_HISTORY);
        }
        return merged;
    }

    getResultFromItem(item) {
        if (!item) return null;
        
        const result = item.result || item.Result || item.ket_qua || item.status || '';
        
        if (!result) return null;
        
        if (typeof result === 'string') {
            const lower = result.toLowerCase();
            if (lower === 't' || lower === 'tài' || lower === 'tai') return 'T';
            if (lower === 'x' || lower === 'xỉu' || lower === 'xiu') return 'X';
            const upper = result.toUpperCase();
            if (upper === 'T' || upper === 'TAI') return 'T';
            if (upper === 'X' || upper === 'XIU') return 'X';
        }
        
        if (typeof result === 'number') {
            return result > 0.5 ? 'T' : 'X';
        }
        
        return null;
    }
}

// ============ JSON OUTPUT HELPER ============

function printTable(data, columns) {
    if (!data || data.length === 0) {
        console.log('  (Không có dữ liệu)');
        return;
    }

    const colWidths = columns.map(col => {
        const maxData = data.reduce((max, row) => {
            const val = String(row[col.key] || '');
            return Math.max(max, val.length);
        }, col.key.length);
        return Math.max(col.key.length, maxData, col.minWidth || 10);
    });

    let separator = '|';
    columns.forEach((col, i) => {
        separator += ` ${'-'.repeat(colWidths[i])} |`;
    });
    
    let header = '|';
    columns.forEach((col, i) => {
        header += ` ${col.key.padEnd(colWidths[i])} |`;
    });
    
    console.log(separator);
    console.log(header);
    console.log(separator);

    data.forEach(row => {
        let line = '|';
        columns.forEach((col, i) => {
            const val = String(row[col.key] || '');
            line += ` ${val.padEnd(colWidths[i])} |`;
        });
        console.log(line);
    });
    console.log(separator);
}

function jsonOutput(data, title = '') {
    if (title) {
        console.log(`\n📋 ${title}`);
        console.log('='.repeat(50));
    }
    console.log(JSON.stringify(data, null, 2));
    console.log('');
}

// ============ REALTIME PREDICTION ============

function getTimeVietnam() {
    const now = new Date();
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
    return vnTime.toLocaleString('vi-VN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
    });
}

async function getPredictionRealtime(system, dataManager) {
    try {
        // Fetch dữ liệu từ API
        const apiData = await dataManager.fetchNewData(CONFIG.API_URL);
        
        if (!apiData || !Array.isArray(apiData) || apiData.length === 0) {
            return {
                status: 'failed',
                model: 'failed',
                error: 'Không thể lấy dữ liệu từ API',
                timevn: getTimeVietnam()
            };
        }

        // Tải model nếu tồn tại
        const modelState = dataManager.loadModelState(system);
        if (!modelState || system.history.length === 0) {
            return {
                status: 'failed',
                model: 'failed',
                error: 'Chưa huấn luyện model. Vui lòng chạy: npm start',
                timevn: getTimeVietnam()
            };
        }

        // Sắp xếp dữ liệu theo index/phien từ cao nhất
        const sortedData = apiData.sort((a, b) => {
            const aIndex = a.phien || a.index || 0;
            const bIndex = b.phien || b.index || 0;
            return bIndex - aIndex;
        });

        const currentData = sortedData[0];
        const currentPhien = currentData?.phien || currentData?.index || 0;
        const nextPhien = currentPhien + 1;

        // Lấy kết quả phiên trước
        let ketQuaPhienTruoc = null;
        if (sortedData.length > 1) {
            const prevData = sortedData[1];
            ketQuaPhienTruoc = dataManager.getResultFromItem(prevData);
        }
        if (!ketQuaPhienTruoc && system.history.length > 0) {
            ketQuaPhienTruoc = system.history[system.history.length - 1];
        }

        // Dự đoán phiên hiện tại
        const prediction = system.getFinalPrediction();
        
        if (!prediction || !prediction.prediction) {
            return {
                status: 'failed',
                model: 'failed',
                error: 'Không thể đưa ra dự đoán',
                timevn: getTimeVietnam()
            };
        }

        // Cập nhật model với kết quả mới (nếu có)
        if (ketQuaPhienTruoc) {
            system.addResult(ketQuaPhienTruoc);
            system.updatePerformance(ketQuaPhienTruoc);
        }

        return {
            status: 'success',
            model: 'hoạt_động',
            phien_hien_tai: nextPhien,
            phien_truoc: currentPhien,
            ket_qua_phien_truoc: ketQuaPhienTruoc || 'N/A',
            du_doan_phien_hien_tai: prediction.prediction,
            do_tin_cay: (prediction.confidence * 100).toFixed(1) + '%',
            volatility: (system.sessionStats.volatility * 100).toFixed(1) + '%',
            regime: system.marketState.regime,
            trend: system.marketState.trend,
            total_sessions: system.history.length,
            timevn: getTimeVietnam(),
            prediction_details: {
                reasons: prediction.reasons.slice(0, 5),
                momentum: system.marketState.momentum.toFixed(3),
                stability: system.marketState.stability.toFixed(3)
            }
        };

    } catch (error) {
        return {
            status: 'failed',
            model: 'failed',
            error: error.message,
            timevn: getTimeVietnam()
        };
    }
}

// ============ COMMANDS ============

async function learnCommand(system, dataManager) {
    console.log('\n🚀 BẮT ĐẦU HỌC TỪ API...');
    console.log('═'.repeat(50));

    console.log(`🌐 Đang lấy dữ liệu từ: ${CONFIG.API_URL}`);
    const apiData = await dataManager.fetchNewData(CONFIG.API_URL);
    
    if (!apiData || !Array.isArray(apiData) || apiData.length === 0) {
        jsonOutput({
            status: 'error',
            message: 'Không thể lấy dữ liệu từ API hoặc dữ liệu rỗng!'
        }, 'LỖI');
        return;
    }

    console.log(`📊 Nhận được ${apiData.length} phiên từ API`);

    const validData = apiData.filter(item => {
        const result = dataManager.getResultFromItem(item);
        return result === 'T' || result === 'X';
    });

    if (validData.length === 0) {
        jsonOutput({
            status: 'error',
            message: 'Không có phiên hợp lệ (T/X) trong dữ liệu!'
        }, 'LỖI');
        return;
    }

    console.log(`✅ Có ${validData.length} phiên hợp lệ`);

    dataManager.saveHistory(validData);
    console.log(`💾 Đã lưu ${validData.length} phiên vào file`);

    console.log('\n📖 Bắt đầu học...');
    
    const results = validData
        .map(item => dataManager.getResultFromItem(item))
        .filter(r => r === 'T' || r === 'X');

    if (results.length === 0) {
        jsonOutput({
            status: 'error',
            message: 'Không có kết quả hợp lệ để học!'
        }, 'LỖI');
        return;
    }

    system.history = [];
    for (let i = 0; i < results.length; i++) {
        system.addResult(results[i]);
        if (i >= 1) {
            system.updatePerformance(results[i]);
        }
        if (i > 0 && i % 10 === 0) {
            system.updatePatternDatabase();
        }
    }

    console.log(`🔄 Học thêm ${CONFIG.LEARN_EPOCHS} epochs...`);
    for (let epoch = 0; epoch < CONFIG.LEARN_EPOCHS; epoch++) {
        for (let i = 0; i < results.length; i++) {
            if (i >= 15) {
                system.updatePerformance(results[i]);
            }
        }
    }

    const modelPath = dataManager.saveModelState(system);
    console.log(`💾 Đã lưu model vào: ${modelPath}`);

    let totalCorrect = 0;
    let totalPred = 0;
    for (const perf of Object.values(system.performance)) {
        totalCorrect += perf.correct || 0;
        totalPred += perf.total || 0;
    }
    const accuracy = totalPred > 0 ? (totalCorrect / totalPred * 100).toFixed(2) : '0';

    jsonOutput({
        status: 'success',
        message: 'Học hoàn tất!',
        totalSessions: system.history.length,
        accuracy: accuracy + '%',
        patternCount: Object.keys(system.patternDatabase).length,
        marketState: system.marketState,
        files: {
            model: modelPath,
            history: dataManager.saveHistory(validData)
        }
    }, 'KẾT QUẢ HỌC');

    console.log('📊 THỐNG KÊ CHI TIẾT');
    console.log('─'.repeat(50));
    
    const stats = [
        { key: 'Chỉ số', value: 'Giá trị' },
        { key: 'Tổng phiên', value: String(system.history.length) },
        { key: 'Độ chính xác', value: accuracy + '%' },
        { key: 'Số pattern', value: String(Object.keys(system.patternDatabase).length) },
        { key: 'Trạng thái', value: system.marketState.regime },
        { key: 'Trend', value: system.marketState.trend },
        { key: 'Độ biến động', value: (system.sessionStats.volatility * 100).toFixed(1) + '%' }
    ];
    
    printTable(stats, [
        { key: 'key', minWidth: 15 },
        { key: 'value', minWidth: 20 }
    ]);

    const topPatterns = Object.entries(system.patternDatabase)
        .sort((a, b) => (b[1].probability || 0) - (a[1].probability || 0))
        .slice(0, 10)
        .map(([key, data]) => ({
            pattern: key,
            probability: ((data.probability || 0) * 100).toFixed(1) + '%',
            strength: ((data.strength || 0) * 100).toFixed(1) + '%'
        }));

    if (topPatterns.length > 0) {
        console.log('\n📈 TOP 10 PATTERN PHỔ BIẾN');
        console.log('─'.repeat(50));
        printTable(topPatterns, [
            { key: 'pattern', minWidth: 20 },
            { key: 'probability', minWidth: 15 },
            { key: 'strength', minWidth: 15 }
        ]);
    }

    const last10 = system.history.slice(-10).map((r, i) => ({
        step: system.history.length - 10 + i + 1,
        result: r
    }));

    console.log('\n📋 10 PHIÊN MỚI NHẤT');
    console.log('─'.repeat(50));
    printTable(last10, [
        { key: 'step', minWidth: 8 },
        { key: 'result', minWidth: 10 }
    ]);
}

async function predictCommand(system, dataManager) {
    console.log('\n🔮 DỰ ĐOÁN...');
    console.log('═'.repeat(50));

    const state = dataManager.loadModelState(system);
    if (!state) {
        jsonOutput({
            status: 'error',
            message: 'Chưa có model đã học! Vui lòng chạy lệnh learn trước.'
        }, 'LỖI');
        return;
    }

    console.log(`📊 Đã tải model với ${system.history.length} phiên`);

    jsonOutput({
        status: 'loaded',
        totalHistory: system.history.length,
        patternCount: Object.keys(system.patternDatabase).length,
        volatility: (system.sessionStats.volatility * 100).toFixed(1) + '%',
        regime: system.marketState.regime,
        trend: system.marketState.trend,
        momentum: system.marketState.momentum.toFixed(3),
        stability: system.marketState.stability.toFixed(3)
    }, 'THÔNG TIN MODEL');

    const finalPred = system.getFinalPrediction();
    if (finalPred && finalPred.prediction) {
        jsonOutput({
            prediction: finalPred.prediction,
            confidence: (finalPred.confidence * 100).toFixed(1) + '%',
            volatility: (system.sessionStats.volatility * 100).toFixed(1) + '%',
            regime: system.marketState.regime,
            trend: system.marketState.trend,
            modelCount: finalPred.reasons ? finalPred.reasons.length : 0
        }, 'DỰ ĐOÁN TỔNG HỢP');

        console.log('📋 CHI TIẾT CÁC MODEL');
        console.log('─'.repeat(50));
        
        const modelDetails = (finalPred.reasons || []).slice(0, 10).map((reason, i) => {
            const parts = reason.split(': ');
            return {
                model: parts[0] || `Model ${i+1}`,
                reason: parts[1] ? parts[1].split(' (')[0] : '',
                confidence: parts[1] ? parts[1].match(/\(([^)]+)\)/)?.[1] || '0' : '0'
            };
        });

        if (modelDetails.length > 0) {
            printTable(modelDetails, [
                { key: 'model', minWidth: 12 },
                { key: 'reason', minWidth: 35 },
                { key: 'confidence', minWidth: 12 }
            ]);
        }

        console.log('\n📈 DỰ ĐOÁN 5 PHIÊN TIẾP THEO');
        console.log('─'.repeat(50));
        
        const predictions = [];
        const tempSystem = new UltraDicePredictionSystem();
        Object.assign(tempSystem, {
            history: [...system.history],
            patternDatabase: JSON.parse(JSON.stringify(system.patternDatabase)),
            weights: JSON.parse(JSON.stringify(system.weights)),
            performance: JSON.parse(JSON.stringify(system.performance)),
            sessionStats: JSON.parse(JSON.stringify(system.sessionStats)),
            marketState: JSON.parse(JSON.stringify(system.marketState)),
            adaptiveParameters: JSON.parse(JSON.stringify(system.adaptiveParameters))
        });

        for (let i = 0; i < 5; i++) {
            const pred = tempSystem.getFinalPrediction();
            if (pred && pred.prediction) {
                predictions.push({
                    step: i + 1,
                    prediction: pred.prediction,
                    confidence: (pred.confidence * 100).toFixed(1) + '%'
                });
                tempSystem.addResult(pred.prediction);
            } else {
                predictions.push({
                    step: i + 1,
                    prediction: '?',
                    confidence: 'N/A'
                });
            }
        }

        printTable(predictions, [
            { key: 'step', minWidth: 8 },
            { key: 'prediction', minWidth: 15 },
            { key: 'confidence', minWidth: 12 }
        ]);

    } else {
        jsonOutput({
            status: 'error',
            message: 'Không thể đưa ra dự đoán!'
        }, 'LỖI');
    }
}

async function updateCommand(system, dataManager) {
    console.log('\n🔄 CẬP NHẬT DỮ LIỆU MỚI...');
    console.log('═'.repeat(50));

    console.log(`🌐 Đang lấy dữ liệu từ: ${CONFIG.API_URL}`);
    const apiData = await dataManager.fetchNewData(CONFIG.API_URL);
    
    if (!apiData || !Array.isArray(apiData) || apiData.length === 0) {
        jsonOutput({
            status: 'error',
            message: 'Không thể lấy dữ liệu từ API hoặc dữ liệu rỗng!'
        }, 'LỖI');
        return;
    }

    console.log(`📊 Nhận được ${apiData.length} phiên từ API`);

    const validData = apiData.filter(item => {
        const result = dataManager.getResultFromItem(item);
        return result === 'T' || result === 'X';
    });

    if (validData.length === 0) {
        jsonOutput({
            status: 'error',
            message: 'Không có phiên hợp lệ (T/X) trong dữ liệu!'
        }, 'LỖI');
        return;
    }

    console.log(`✅ Có ${validData.length} phiên hợp lệ`);

    const oldData = dataManager.loadHistory();
    const newSessions = dataManager.getNewSessions(oldData, validData);

    if (newSessions.length === 0) {
        jsonOutput({
            status: 'info',
            message: 'Không có phiên mới để cập nhật!',
            totalSessions: oldData ? oldData.length : 0
        }, 'THÔNG TIN');
        return;
    }

    console.log(`🆕 Có ${newSessions.length} phiên mới`);

    const mergedData = dataManager.mergeHistory(oldData, newSessions);
    const historyPath = dataManager.saveHistory(mergedData);
    console.log(`💾 Đã lưu ${mergedData.length} phiên vào file`);

    const newResults = newSessions
        .map(item => dataManager.getResultFromItem(item))
        .filter(r => r === 'T' || r === 'X');

    for (const result of newResults) {
        system.addResult(result);
        system.updatePerformance(result);
    }

    const modelPath = dataManager.saveModelState(system);
    console.log(`💾 Đã cập nhật model vào: ${modelPath}`);

    let totalCorrect = 0;
    let totalPred = 0;
    for (const perf of Object.values(system.performance)) {
        totalCorrect += perf.correct || 0;
        totalPred += perf.total || 0;
    }
    const accuracy = totalPred > 0 ? (totalCorrect / totalPred * 100).toFixed(2) : '0';

    jsonOutput({
        status: 'success',
        message: 'Cập nhật hoàn tất!',
        newSessions: newSessions.length,
        totalSessions: system.history.length,
        accuracy: accuracy + '%',
        files: {
            model: modelPath,
            history: historyPath
        }
    }, 'KẾT QUẢ CẬP NHẬT');
}

async function infoCommand(system, dataManager) {
    console.log('\n📊 THÔNG TIN HỆ THỐNG');
    console.log('═'.repeat(50));

    const historyData = dataManager.loadHistory();
    const modelState = dataManager.loadModelState(system);

    const info = {
        status: 'ok',
        config: CONFIG,
        dataFiles: {
            historyFile: `${CONFIG.DATA_FILE} (${historyData ? historyData.length : 0} phiên)`,
            modelFile: `${CONFIG.MODEL_FILE} (${modelState ? 'tồn tại' : 'chưa lưu'})`,
            dataDirectory: system.dataDir || path.join(__dirname, 'data')
        },
        systemStats: {
            totalHistorySessions: system.history.length,
            volatility: (system.sessionStats.volatility * 100).toFixed(1) + '%',
            regime: system.marketState.regime,
            trend: system.marketState.trend,
            bias: {
                T: (system.sessionStats.bias.T * 100).toFixed(1) + '%',
                X: (system.sessionStats.bias.X * 100).toFixed(1) + '%'
            }
        }
    };

    jsonOutput(info, 'THÔNG TIN HỆ THỐNG');
}

async function statsCommand(system, dataManager) {
    console.log('\n📈 THỐNG KÊ CHI TIẾT');
    console.log('═'.repeat(50));

    const stats = [];
    for (let i = 1; i <= 21; i++) {
        const modelName = `model${i}`;
        const perf = system.performance[modelName];
        if (perf && perf.total > 0) {
            stats.push({
                model: modelName,
                accuracy: ((perf.correct / perf.total) * 100).toFixed(1) + '%',
                total: perf.total,
                weight: (system.weights[modelName] || 1).toFixed(2),
                streak: perf.streak,
                maxStreak: perf.maxStreak
            });
        }
    }

    if (stats.length > 0) {
        printTable(stats, [
            { key: 'model', minWidth: 10 },
            { key: 'accuracy', minWidth: 10 },
            { key: 'total', minWidth: 8 },
            { key: 'weight', minWidth: 8 },
            { key: 'streak', minWidth: 8 },
            { key: 'maxStreak', minWidth: 10 }
        ]);
    } else {
        console.log('❌ Không có dữ liệu thống kê');
    }
}

async function testCommand(system) {
    console.log('\n🧪 KIỂM TRA HỆ THỐNG');
    console.log('═'.repeat(50));

    const testData = ['T', 'X', 'T', 'X', 'T', 'X', 'T', 'X', 'T', 'T', 'X', 'X', 'T', 'T', 'X', 'X'];
    
    system.history = [];
    for (const result of testData) {
        system.addResult(result);
    }

    const pred = system.getFinalPrediction();

    jsonOutput({
        status: 'success',
        message: 'Kiểm tra hoàn tất!',
        testDataCount: testData.length,
        prediction: pred ? pred.prediction : '?',
        confidence: pred ? (pred.confidence * 100).toFixed(1) + '%' : 'N/A',
        volatility: (system.sessionStats.volatility * 100).toFixed(1) + '%',
        regime: system.marketState.regime
    }, 'KẾT QUẢ KIỂM TRA');
}

async function realtimeCommand(system, dataManager) {
    console.log('\n🔮 DỰ ĐOÁN REALTIME');
    console.log('═'.repeat(50));

    const result = await getPredictionRealtime(system, dataManager);
    console.log(JSON.stringify(result, null, 2));
}

async function monitorCommand(system, dataManager) {
    console.log('\n📡 GIÁM SÁT REALTIME (Cập nhật mỗi 30 giây)');
    console.log('═'.repeat(50));
    console.log('Nhấn Ctrl+C để dừng\n');

    const interval = setInterval(async () => {
        try {
            console.clear();
            console.log('📡 GIÁM SÁT REALTIME - Hệ Thống Dự Đoán Xúc Xắc');
            console.log('═'.repeat(60));
            
            const result = await getPredictionRealtime(system, dataManager);
            
            if (result.status === 'success') {
                console.log('\n✅ TRẠNG THÁI: HOẠT ĐỘNG\n');
                console.log(`📊 Phiên hiện tại: #${result.phien_hien_tai}`);
                console.log(`📋 Phiên trước: #${result.phien_truoc} - Kết quả: ${result.ket_qua_phien_truoc}`);
                console.log(`\n🎯 DỰ ĐOÁN PHIÊN #${result.phien_hien_tai}: ${result.du_doan_phien_hien_tai}`);
                console.log(`📈 Độ tin cậy: ${result.do_tin_cay}`);
                console.log(`\n📊 PHÂN TÍCH:`);
                console.log(`   - Volatility: ${result.volatility}`);
                console.log(`   - Regime: ${result.regime}`);
                console.log(`   - Trend: ${result.trend}`);
                console.log(`   - Momentum: ${result.prediction_details.momentum}`);
                console.log(`   - Stability: ${result.prediction_details.stability}`);
                console.log(`\n📍 Tổng phiên học: ${result.total_sessions}`);
                console.log(`🕐 Thời gian VN: ${result.timevn}`);
                console.log('\n' + '═'.repeat(60));
            } else {
                console.log('\n❌ TRẠNG THÁI: LỖI');
                console.log(`Lỗi: ${result.error}`);
                console.log(`🕐 Thời gian VN: ${result.timevn}`);
                console.log('\n' + '═'.repeat(60));
            }
        } catch (error) {
            console.error('❌ Lỗi trong giám sát:', error.message);
        }
    }, 30000);

    // Chạy một lần ngay lập tức
    console.clear();
    const result = await getPredictionRealtime(system, dataManager);
    if (result.status === 'success') {
        console.log('\n✅ TRẠNG THÁI: HOẠT ĐỘNG\n');
        console.log(`📊 Phiên hiện tại: #${result.phien_hien_tai}`);
        console.log(`📋 Phiên trước: #${result.phien_truoc} - Kết quả: ${result.ket_qua_phien_truoc}`);
        console.log(`\n🎯 DỰ ĐOÁN PHIÊN #${result.phien_hien_tai}: ${result.du_doan_phien_hien_tai}`);
        console.log(`📈 Độ tin cậy: ${result.do_tin_cay}`);
        console.log(`\n📊 PHÂN TÍCH:`);
        console.log(`   - Volatility: ${result.volatility}`);
        console.log(`   - Regime: ${result.regime}`);
        console.log(`   - Trend: ${result.trend}`);
        console.log(`   - Momentum: ${result.prediction_details.momentum}`);
        console.log(`   - Stability: ${result.prediction_details.stability}`);
        console.log(`\n📍 Tổng phiên học: ${result.total_sessions}`);
        console.log(`🕐 Thời gian VN: ${result.timevn}`);
        console.log('\n' + '═'.repeat(60));
    } else {
        console.log('\n❌ TRẠNG THÁI: LỖI');
        console.log(`Lỗi: ${result.error}`);
        console.log(`🕐 Thời gian VN: ${result.timevn}`);
        console.log('\n' + '═'.repeat(60));
    }

    // Handle Ctrl+C
    process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('\n\n👋 Dừng giám sát. Tạm biệt!');
        process.exit(0);
    });
}

// ============ MAIN ============

async function main() {
    const system = new UltraDicePredictionSystem();
    const dataManager = new DataManager();

    const command = process.argv[2] || 'help';
    const args = process.argv.slice(3);

    try {
        switch (command) {
            case 'learn':
                await learnCommand(system, dataManager);
                break;
            case 'predict':
                await predictCommand(system, dataManager);
                break;
            case 'realtime':
                await realtimeCommand(system, dataManager);
                break;
            case 'monitor':
                await monitorCommand(system, dataManager);
                break;
            case 'update':
                await updateCommand(system, dataManager);
                break;
            case 'info':
                await infoCommand(system, dataManager);
                break;
            case 'stats':
                await statsCommand(system, dataManager);
                break;
            case 'test':
                await testCommand(system);
                break;
            case 'help':
            default:
                console.log('\n📖 HƯỚNG DẪN SỬ DỤNG - Hệ Thống Dự Đoán Xúc Xắc');
                console.log('═'.repeat(60));
                console.log('\n🎯 CÁC LỆNH CHÍNH:\n');
                console.log('  1️⃣  Huấn luyện & Cập nhật:');
                console.log('      node index.js learn       - Tải dữ liệu từ API và bắt đầu học');
                console.log('      node index.js update      - Cập nhật dữ liệu mới từ API\n');
                console.log('  2️⃣  Dự đoán:');
                console.log('      node index.js predict     - Dự đoán chi tiết (phức tạp)');
                console.log('      node index.js realtime    - Dự đoán JSON realtime (đơn giản)\n');
                console.log('  3️⃣  Giám sát:');
                console.log('      node index.js monitor     - Giám sát realtime (update 30s)\n');
                console.log('  4️⃣  Thông tin & Thống kê:');
                console.log('      node index.js info        - Hiển thị thông tin hệ thống');
                console.log('      node index.js stats       - Hiển thị thống kê chi tiết');
                console.log('      node index.js test        - Kiểm tra hệ thống');
                console.log('      node index.js help        - Hiển thị trợ giúp này\n');
                console.log('═'.repeat(60));
                console.log('\n💡 HƯỚNG DẪN NHANH:\n');
                console.log('  Lần đầu tiên:');
                console.log('    1. npm start                  (học model từ API)');
                console.log('    2. npm run realtime           (dự đoán JSON)');
                console.log('    3. npm run monitor            (giám sát realtime)\n');
                console.log('  Cập nhật liên tục:');
                console.log('    npm run update                (cập nhật dữ liệu mới)');
                console.log('    npm run realtime              (dự đoán phiên tới)\n');
                console.log('═'.repeat(60));
                console.log('\n📋 OUTPUT REALTIME JSON:\n');
                console.log('  {\n');
                console.log('    "status": "success",');
                console.log('    "model": "hoạt_động",');
                console.log('    "phien_hien_tai": 12345,');
                console.log('    "ket_qua_phien_truoc": "T" hoặc "X",');
                console.log('    "du_doan_phien_hien_tai": "T" hoặc "X",');
                console.log('    "do_tin_cay": "75.5%",');
                console.log('    "timevn": "2024-01-15 14:30:45"');
                console.log('  }\n');
                console.log('═'.repeat(60) + '\n');
                break;
        }
    } catch (error) {
        console.error('\n❌ LỖI:', error.message);
        console.error(error.stack);
    }
}

main().catch(console.error);
