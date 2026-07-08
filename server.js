// server.js
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { UltraDicePredictionSystem } = require('./thuattoan.js');

// Cấu hình
const CONFIG = {
    PORT: 3000,
    API_URL: 'http://fi8.bot-hosting.net:20692/api/his',
    DATA_FILE: 'history_data.json',
    MODEL_FILE: 'model_state.json',
    LEARN_EPOCHS: 3,
    BATCH_SIZE: 100,
    AUTO_FETCH_INTERVAL: 60000, // 60 giây (1 phút)
    AUTO_FETCH_ENABLED: true,
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
            const data = fs.readFileSync(filepath, 'utf8');
            return JSON.parse(data);
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
            learningStats: system.learningStats,
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
            const data = fs.readFileSync(filepath, 'utf8');
            const state = JSON.parse(data);
            
            system.history = state.history || [];
            system.weights = state.weights || {};
            system.performance = state.performance || {};
            system.patternDatabase = state.patternDatabase || {};
            system.sessionStats = state.sessionStats || {};
            system.marketState = state.marketState || {};
            system.adaptiveParameters = state.adaptiveParameters || {};
            system.learningStats = state.learningStats || {};
            
            return state;
        }
        return null;
    }

    async fetchNewData(apiUrl) {
        try {
            const fetch = require('node-fetch');
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('❌ Lỗi fetch API:', error.message);
            return null;
        }
    }

    getNewSessions(oldData, newData) {
        if (!oldData || oldData.length === 0) {
            return newData;
        }

        const lastOldSession = oldData[oldData.length - 1];
        const lastOldIndex = lastOldSession ? lastOldSession.index || 0 : 0;

        const newSessions = newData.filter(item => {
            const currentIndex = item.index || 0;
            return currentIndex > lastOldIndex;
        });

        return newSessions;
    }

    mergeHistory(oldData, newSessions) {
        if (!oldData || oldData.length === 0) {
            return newSessions;
        }
        const merged = [...oldData, ...newSessions];
        // Giới hạn số lượng để tránh quá tải
        if (merged.length > CONFIG.MAX_HISTORY) {
            return merged.slice(-CONFIG.MAX_HISTORY);
        }
        return merged;
    }
}

// ============ SERVER ============

class PredictionServer {
    constructor() {
        this.system = new UltraDicePredictionSystem();
        this.dataManager = new DataManager();
        this.isReady = false;
        this.isLearning = false;
        this.lastUpdate = null;
        this.totalSessions = 0;
        this.autoFetchTimer = null;
        this.fetchCount = 0;
        this.lastFetchTime = null;
        this.totalFetched = 0;
        
        // Tải model nếu có
        this.loadModel();
        
        // Bắt đầu auto fetch nếu được bật
        if (CONFIG.AUTO_FETCH_ENABLED) {
            this.startAutoFetch();
        }
    }

    loadModel() {
        const state = this.dataManager.loadModelState(this.system);
        if (state) {
            this.isReady = true;
            this.totalSessions = this.system.history.length;
            this.lastUpdate = state.savedAt || new Date().toISOString();
            console.log(`✅ Đã tải model: ${this.totalSessions} phiên`);
            console.log(`📊 Pattern: ${Object.keys(this.system.patternDatabase).length}`);
            console.log(`📈 Trạng thái: ${this.system.marketState.regime}`);
        } else {
            console.log('⚠️ Chưa có model, sẽ tự động học khi có dữ liệu');
        }
    }

    startAutoFetch() {
        console.log(`🔄 Auto-fetch enabled: mỗi ${CONFIG.AUTO_FETCH_INTERVAL / 1000} giây`);
        
        // Fetch ngay lập tức khi start
        setTimeout(() => {
            this.autoFetch();
        }, 2000);

        // Lên lịch fetch định kỳ
        this.autoFetchTimer = setInterval(() => {
            this.autoFetch();
        }, CONFIG.AUTO_FETCH_INTERVAL);
    }

    stopAutoFetch() {
        if (this.autoFetchTimer) {
            clearInterval(this.autoFetchTimer);
            this.autoFetchTimer = null;
            console.log('⏹️ Đã dừng auto-fetch');
        }
    }

    async autoFetch() {
        if (this.isLearning) {
            console.log('⏳ Đang học, bỏ qua auto-fetch');
            return;
        }

        this.fetchCount++;
        console.log(`\n🔄 [Auto-fetch #${this.fetchCount}] Đang kiểm tra dữ liệu mới...`);

        try {
            const apiData = await this.dataManager.fetchNewData(CONFIG.API_URL);
            
            if (!apiData) {
                console.log('❌ Không thể lấy dữ liệu từ API');
                return;
            }

            const oldData = this.dataManager.loadHistory();
            let newSessions = [];
            let mergedData = [];

            if (oldData) {
                newSessions = this.dataManager.getNewSessions(oldData, apiData);
                mergedData = this.dataManager.mergeHistory(oldData, newSessions);
            } else {
                mergedData = apiData.map((item, index) => ({
                    ...item,
                    index: index + 1
                }));
                newSessions = mergedData;
            }

            this.lastFetchTime = new Date().toISOString();

            if (newSessions.length === 0) {
                console.log(`✅ Không có dữ liệu mới. Tổng: ${oldData ? oldData.length : 0} phiên`);
                return;
            }

            console.log(`📊 Phát hiện ${newSessions.length} phiên mới!`);
            console.log(`📚 Tổng: ${mergedData.length} phiên`);

            // Lưu dữ liệu
            this.dataManager.saveHistory(mergedData);

            // Học dữ liệu mới
            console.log('📖 Đang học dữ liệu mới...');
            
            const newResults = newSessions.map(item => item.result).filter(r => r === 'T' || r === 'X');
            
            // Thêm vào hệ thống
            for (const result of newResults) {
                this.system.addResult(result);
                this.system.updatePerformance(result);
                if (this.system.history.length % 10 === 0) {
                    this.system.updatePatternDatabase();
                }
            }

            // Học thêm epochs cho dữ liệu mới
            for (let epoch = 0; epoch < CONFIG.LEARN_EPOCHS; epoch++) {
                for (const result of newResults) {
                    this.system.updatePerformance(result);
                }
            }

            // Lưu model
            this.dataManager.saveModelState(this.system);
            
            this.isReady = true;
            this.totalSessions = this.system.history.length;
            this.lastUpdate = new Date().toISOString();
            this.totalFetched += newSessions.length;

            console.log(`✅ Đã học ${newSessions.length} phiên mới!`);
            console.log(`📊 Tổng: ${this.totalSessions} phiên`);
            console.log(`📈 Pattern: ${Object.keys(this.system.patternDatabase).length}`);
            console.log(`🎯 Độ chính xác: ${this.getAccuracy()}%`);

        } catch (error) {
            console.error('❌ Lỗi auto-fetch:', error.message);
        }
    }

    getAccuracy() {
        let totalCorrect = 0;
        let totalPred = 0;
        for (const perf of Object.values(this.system.performance)) {
            totalCorrect += perf.correct || 0;
            totalPred += perf.total || 0;
        }
        return totalPred > 0 ? (totalCorrect / totalPred * 100).toFixed(2) : '0.00';
    }

    async learnFromAPI() {
        if (this.isLearning) {
            return { status: 'error', message: 'Đang học, vui lòng đợi...' };
        }

        this.isLearning = true;
        console.log('🚀 Bắt đầu học từ API...');

        try {
            const apiData = await this.dataManager.fetchNewData(CONFIG.API_URL);
            
            if (!apiData) {
                this.isLearning = false;
                return { status: 'error', message: 'Không thể lấy dữ liệu từ API!' };
            }

            console.log(`📊 Nhận được ${apiData.length} phiên từ API`);

            const oldData = this.dataManager.loadHistory();
            let newSessions = [];
            let mergedData = [];

            if (oldData) {
                newSessions = this.dataManager.getNewSessions(oldData, apiData);
                mergedData = this.dataManager.mergeHistory(oldData, newSessions);
                console.log(`🆕 Phiên mới: ${newSessions.length}`);
                console.log(`📚 Tổng: ${mergedData.length}`);
            } else {
                mergedData = apiData.map((item, index) => ({
                    ...item,
                    index: index + 1
                }));
                newSessions = mergedData;
            }

            if (newSessions.length === 0 && oldData) {
                this.isLearning = false;
                return {
                    status: 'success',
                    message: 'Không có dữ liệu mới',
                    totalSessions: oldData.length,
                    newSessions: 0
                };
            }

            // Lưu dữ liệu
            this.dataManager.saveHistory(mergedData);

            // Học
            const results = mergedData.map(item => item.result).filter(r => r === 'T' || r === 'X');
            
            // Reset và học lại toàn bộ
            this.system.history = [];
            for (let i = 0; i < results.length; i++) {
                this.system.addResult(results[i]);
                if (i >= 1) {
                    this.system.updatePerformance(results[i]);
                }
                if (i > 0 && i % 10 === 0) {
                    this.system.updatePatternDatabase();
                }
            }

            // Học thêm epochs
            for (let epoch = 0; epoch < CONFIG.LEARN_EPOCHS; epoch++) {
                for (let i = 0; i < results.length; i++) {
                    if (i >= 15) {
                        this.system.updatePerformance(results[i]);
                    }
                }
            }

            // Lưu model
            this.dataManager.saveModelState(this.system);
            
            this.isReady = true;
            this.totalSessions = this.system.history.length;
            this.lastUpdate = new Date().toISOString();
            this.totalFetched += newSessions.length;

            this.isLearning = false;

            return {
                status: 'success',
                message: 'Học hoàn tất!',
                totalSessions: this.totalSessions,
                newSessions: newSessions.length,
                patternCount: Object.keys(this.system.patternDatabase).length,
                accuracy: this.getAccuracy() + '%',
                marketState: this.system.marketState
            };

        } catch (error) {
            this.isLearning = false;
            console.error('❌ Lỗi học:', error.message);
            return { status: 'error', message: error.message };
        }
    }

    getPrediction() {
        if (!this.isReady) {
            return {
                status: 'error',
                message: 'Model chưa sẵn sàng! Vui lòng đợi học xong.'
            };
        }

        const prediction = this.system.getFinalPrediction();
        
        if (!prediction || !prediction.prediction) {
            return {
                status: 'error',
                message: 'Không thể đưa ra dự đoán!'
            };
        }

        return {
            status: 'success',
            timestamp: new Date().toISOString(),
            totalSessions: this.system.history.length,
            prediction: prediction.prediction,
            confidence: (prediction.confidence * 100).toFixed(1) + '%',
            accuracy: this.getAccuracy() + '%',
            stats: {
                patterns: Object.keys(this.system.patternDatabase).length,
                volatility: (this.system.sessionStats.volatility * 100).toFixed(1) + '%',
                regime: this.system.marketState.regime,
                trend: this.system.marketState.trend,
                momentum: this.system.marketState.momentum.toFixed(3),
                stability: this.system.marketState.stability.toFixed(3)
            },
            streak: {
                T: this.system.sessionStats.streaks.T,
                X: this.system.sessionStats.streaks.X,
                maxT: this.system.sessionStats.streaks.maxT,
                maxX: this.system.sessionStats.streaks.maxX
            },
            modelDetails: prediction.reasons.slice(0, 10).map(r => {
                const parts = r.split(': ');
                return {
                    model: parts[0] || '',
                    detail: parts[1] ? parts[1].split(' (')[0] : '',
                    confidence: parts[1] ? parts[1].match(/\(([^)]+)\)/)?.[1] || '0' : '0'
                };
            })
        };
    }

    getPredictionNext(n = 5) {
        if (!this.isReady) {
            return {
                status: 'error',
                message: 'Model chưa sẵn sàng!'
            };
        }

        const predictions = [];
        const tempSystem = new UltraDicePredictionSystem();
        
        tempSystem.history = [...this.system.history];
        tempSystem.patternDatabase = JSON.parse(JSON.stringify(this.system.patternDatabase));
        tempSystem.weights = JSON.parse(JSON.stringify(this.system.weights));
        tempSystem.performance = JSON.parse(JSON.stringify(this.system.performance));
        tempSystem.sessionStats = JSON.parse(JSON.stringify(this.system.sessionStats));
        tempSystem.marketState = JSON.parse(JSON.stringify(this.system.marketState));
        tempSystem.adaptiveParameters = JSON.parse(JSON.stringify(this.system.adaptiveParameters));

        for (let i = 0; i < n; i++) {
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

        return {
            status: 'success',
            timestamp: new Date().toISOString(),
            totalSessions: this.system.history.length,
            accuracy: this.getAccuracy() + '%',
            predictions: predictions
        };
    }

    getStats() {
        if (!this.isReady) {
            return {
                status: 'error',
                message: 'Model chưa sẵn sàng!'
            };
        }

        const performance = this.system.model13Mini();
        const topModels = Object.entries(performance)
            .sort((a, b) => b[1].accuracy - a[1].accuracy)
            .slice(0, 5)
            .map(([model, stats]) => ({
                model: model,
                accuracy: (stats.accuracy * 100).toFixed(1) + '%',
                total: stats.total,
                streak: stats.streak,
                maxStreak: stats.maxStreak
            }));

        const topPatterns = Object.entries(this.system.patternDatabase)
            .sort((a, b) => b[1].probability - a[1].probability)
            .slice(0, 10)
            .map(([key, data]) => ({
                pattern: key,
                probability: (data.probability * 100).toFixed(1) + '%',
                strength: (data.strength * 100).toFixed(1) + '%'
            }));

        return {
            status: 'success',
            timestamp: new Date().toISOString(),
            totalSessions: this.system.history.length,
            patternCount: Object.keys(this.system.patternDatabase).length,
            accuracy: this.getAccuracy() + '%',
            marketState: this.system.marketState,
            volatility: (this.system.sessionStats.volatility * 100).toFixed(1) + '%',
            streak: {
                T: this.system.sessionStats.streaks.T,
                X: this.system.sessionStats.streaks.X,
                maxT: this.system.sessionStats.streaks.maxT,
                maxX: this.system.sessionStats.streaks.maxX
            },
            transitions: this.system.sessionStats.transitions,
            topModels: topModels,
            topPatterns: topPatterns,
            autoFetch: {
                enabled: CONFIG.AUTO_FETCH_ENABLED,
                interval: CONFIG.AUTO_FETCH_INTERVAL / 1000 + 's',
                totalFetches: this.fetchCount,
                totalFetched: this.totalFetched,
                lastFetch: this.lastFetchTime
            },
            lastUpdate: this.lastUpdate,
            isReady: this.isReady,
            isLearning: this.isLearning
        };
    }

    getHistory(limit = 100) {
        if (!this.isReady) {
            return {
                status: 'error',
                message: 'Model chưa sẵn sàng!'
            };
        }

        const history = this.system.history.slice(-limit).map((result, index) => ({
            step: this.system.history.length - limit + index + 1,
            result: result
        }));

        return {
            status: 'success',
            timestamp: new Date().toISOString(),
            totalSessions: this.system.history.length,
            limit: limit,
            history: history
        };
    }

    async update() {
        return await this.learnFromAPI();
    }
}

// ============ CREATE SERVER ============

const server = new PredictionServer();

const requestHandler = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // Route: /
    if (pathname === '/' || pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'Ultra Dice Prediction System',
            version: '1.0.0',
            autoFetch: {
                enabled: CONFIG.AUTO_FETCH_ENABLED,
                interval: CONFIG.AUTO_FETCH_INTERVAL / 1000 + 's'
            },
            endpoints: [
                { path: '/', method: 'GET', description: 'Health check' },
                { path: '/info', method: 'GET', description: 'System info' },
                { path: '/predict', method: 'GET', description: 'Get prediction' },
                { path: '/predict/next', method: 'GET', description: 'Get next N predictions', params: { n: 'number (default: 5)' } },
                { path: '/stats', method: 'GET', description: 'Get statistics' },
                { path: '/history', method: 'GET', description: 'Get history', params: { limit: 'number (default: 100)' } },
                { path: '/learn', method: 'POST', description: 'Learn from API (full)' },
                { path: '/update', method: 'POST', description: 'Update with new data' },
                { path: '/fetch/stop', method: 'POST', description: 'Stop auto-fetch' },
                { path: '/fetch/start', method: 'POST', description: 'Start auto-fetch' }
            ]
        }, null, 2));
        return;
    }

    // Route: /info
    if (pathname === '/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            isReady: server.isReady,
            isLearning: server.isLearning,
            totalSessions: server.totalSessions,
            accuracy: server.getAccuracy() + '%',
            lastUpdate: server.lastUpdate,
            patternCount: server.isReady ? Object.keys(server.system.patternDatabase).length : 0,
            marketState: server.isReady ? server.system.marketState : null,
            autoFetch: {
                enabled: CONFIG.AUTO_FETCH_ENABLED,
                interval: CONFIG.AUTO_FETCH_INTERVAL / 1000 + 's',
                totalFetches: server.fetchCount,
                totalFetched: server.totalFetched,
                lastFetch: server.lastFetchTime
            }
        }, null, 2));
        return;
    }

    // Route: /predict
    if (pathname === '/predict') {
        const result = server.getPrediction();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    // Route: /predict/next
    if (pathname === '/predict/next') {
        const n = parseInt(query.n) || 5;
        const result = server.getPredictionNext(n);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    // Route: /stats
    if (pathname === '/stats') {
        const result = server.getStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    // Route: /history
    if (pathname === '/history') {
        const limit = parseInt(query.limit) || 100;
        const result = server.getHistory(limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    // Route: /learn (POST)
    if (pathname === '/learn' && req.method === 'POST') {
        const result = await server.learnFromAPI();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    // Route: /update (POST)
    if (pathname === '/update' && req.method === 'POST') {
        const result = await server.update();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    // Route: /fetch/stop (POST)
    if (pathname === '/fetch/stop' && req.method === 'POST') {
        server.stopAutoFetch();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'success',
            message: 'Đã dừng auto-fetch'
        }, null, 2));
        return;
    }

    // Route: /fetch/start (POST)
    if (pathname === '/fetch/start' && req.method === 'POST') {
        if (!CONFIG.AUTO_FETCH_ENABLED) {
            CONFIG.AUTO_FETCH_ENABLED = true;
        }
        server.startAutoFetch();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'success',
            message: 'Đã bắt đầu auto-fetch',
            interval: CONFIG.AUTO_FETCH_INTERVAL / 1000 + 's'
        }, null, 2));
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'error',
        message: 'Endpoint not found',
        path: pathname
    }, null, 2));
};

// ============ START SERVER ============

const httpServer = http.createServer(requestHandler);

httpServer.listen(CONFIG.PORT, () => {
    console.log('🎲 ULTRA DICE PREDICTION SYSTEM - API SERVER');
    console.log('═'.repeat(50));
    console.log(`🚀 Server running on: http://localhost:${CONFIG.PORT}`);
    console.log('');
    console.log('📋 ENDPOINTS:');
    console.log(`  GET  /              - Health check`);
    console.log(`  GET  /info          - System info`);
    console.log(`  GET  /predict       - Get prediction`);
    console.log(`  GET  /predict/next?n=5 - Get next N predictions`);
    console.log(`  GET  /stats         - Get statistics`);
    console.log(`  GET  /history?limit=100 - Get history`);
    console.log(`  POST /learn         - Learn from API (full)`);
    console.log(`  POST /update        - Update with new data (+1)`);
    console.log(`  POST /fetch/stop    - Stop auto-fetch`);
    console.log(`  POST /fetch/start   - Start auto-fetch`);
    console.log('');
    console.log('🔄 AUTO-FETCH:');
    console.log(`  Trạng thái: ${CONFIG.AUTO_FETCH_ENABLED ? '✅ BẬT' : '❌ TẮT'}`);
    console.log(`  Khoảng cách: ${CONFIG.AUTO_FETCH_INTERVAL / 1000} giây`);
    console.log('');
    console.log('═'.repeat(50));

    // Tự động học nếu chưa có model
    if (!server.isReady) {
        console.log('📚 Chưa có model, tự động học...');
        setTimeout(() => {
            server.learnFromAPI().then(result => {
                if (result.status === 'success') {
                    console.log('✅ Học thành công!');
                    console.log(`📊 ${result.totalSessions} phiên, ${result.patternCount} patterns`);
                    console.log(`🎯 Độ chính xác: ${result.accuracy}`);
                } else {
                    console.log('❌ Học thất bại:', result.message);
                }
            });
        }, 3000);
    }
});

// ============ GRACEFUL SHUTDOWN ============

process.on('SIGINT', () => {
    console.log('\n🛑 Đang tắt server...');
    server.stopAutoFetch();
    httpServer.close(() => {
        console.log('✅ Server đã tắt');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Đang tắt server...');
    server.stopAutoFetch();
    httpServer.close(() => {
        console.log('✅ Server đã tắt');
        process.exit(0);
    });
});
