// 全局变量
let socket = null;
let monitorSocket = null; // /monitor 命名空间专用 Socket
let mediaStream = null;
let mediaRecorder = null;
let currentSessionId = null;
let isRecording = false;
let analysisCount = 0;
let sessionStartTime = null;
let audioContext = null;
let analyser = null;

// 计时器管理变量
let analysisTimer = null;

// 视频上传相关变量
let isVideoAnalyzing = false;
let uploadedVideoInfo = null;

// 图表实例
let audioEmotionChart = null;
let videoEmotionChart = null;
let emotionTrendChart = null;

// 趋势数据
let emotionTrendData = {
    labels: [],
    audioData: [],
    videoData: []
};

// 心率检测数据
let heartRateData = {
    currentHeartRate: 0,
    confidence: 0,
    quality: 'waiting',
    history: []
};

// 教师监控模式相关变量
let currentMode = 'local'; // 'local' 或 'monitor'
let studentSessions = [];
let currentMonitoringStudent = null;
let monitoringTimer = null;
let statePollTimer = null; // 轮询AI状态的定时器（简化替代Socket事件）
let audioStatusTimer = null; // RTSP音频状态轮询
// WHEP 播放相关
let whepPc = null;
let whepResourceUrl = null;
let whepMediaStream = null;

// 情绪中文翻译映射 - 支持9类情绪
const emotionTranslations = {
    'angry': '愤怒',
    'disgusted': '厌恶',
    'fearful': '恐惧',
    'happy': '快乐',
    'neutral': '中性',
    'other': '其他',
    'sad': '悲伤',
    'surprised': '惊讶',
    'unknown': '未知',
    // 兼容旧版本
    'disgust': '厌恶',
    'fear': '恐惧',
    'surprise': '惊讶'
};

// DOM元素
const elements = {
    saveRecordBtn: document.getElementById('save-record-btn'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    detectionRecordsBtn: document.getElementById('detection-records-btn'),
    videoPreview: document.getElementById('video-preview'),
    videoCanvas: document.getElementById('video-canvas'),
    audioCanvas: document.getElementById('audio-canvas'),
    connectionStatus: document.getElementById('connection-status'),
    faceDetectionStatus: document.getElementById('faceDetectionStatus'),
    errorMessage: document.getElementById('error-message'),

    // 控制面板元素
    fileUpload: document.getElementById('fileUpload'),
    uploadArea: document.getElementById('uploadArea'),
    uploadStatus: document.getElementById('uploadStatus'),
    startCameraMic: document.getElementById('startCameraMic'),
    stopDetection: document.getElementById('stopDetection'),

    // 系统状态元素
    cameraStatus: document.getElementById('cameraStatus'),
    microphoneStatus: document.getElementById('microphoneStatus'),
    sessionDuration: document.getElementById('sessionDuration'),
    analysisCount: document.getElementById('analysisCount'),
    sessionId: document.getElementById('sessionId'),

    // 结果显示元素
    videoDominantEmotion: document.getElementById('videoDominantEmotion'),
    videoDetectionStatus: document.getElementById('videoDetectionStatus'),
    audioDominantEmotion: document.getElementById('audioDominantEmotion'),
    audioDetectionStatus: document.getElementById('audioDetectionStatus'),

    // 综合评估元素
    overallEmotion: document.getElementById('overallEmotion'),
    emotionIntensity: document.getElementById('emotionIntensity'),
    analysisTime: document.getElementById('analysisTime'),
    emotionIndicator: document.getElementById('emotionIndicator'),
    emotionIcon: document.getElementById('emotionIcon'),

    // 趋势控制元素
    showAudioTrend: document.getElementById('show-audio-trend'),
    showVideoTrend: document.getElementById('show-video-trend'),
    clearTrend: document.getElementById('clear-trend'),

    // 心率检测元素
    heartRateDisplay: document.getElementById('heartRateDisplay'),
    heartRateValue: document.getElementById('heartRateValue'),
    heartRateIcon: document.getElementById('heartRateIcon'),
    heartRateProgress: document.getElementById('heartRateProgress'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),

    // 加载和通知元素
    loadingOverlay: document.getElementById('loadingOverlay'),
    notificationContainer: document.getElementById('notificationContainer')
};

function checkDOMElements() {
    console.log('检查关键DOM元素...');
    
    const criticalElements = [
        'videoDominantEmotion',
        'audioDominantEmotion', 
        'heartRateDisplay',
        'videoDetectionStatus',
        'audioDetectionStatus',
        'startCameraMic',
        'stopDetection',
        'fileUpload'
    ];
    
    let missingElements = [];
    
    criticalElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            console.log(`✅ ${elementId} 元素找到`);
        } else {
            console.error(`❌ ${elementId} 元素未找到`);
            missingElements.push(elementId);
        }
    });
    
    if (missingElements.length > 0) {
        console.error('缺失的DOM元素:', missingElements);
        showError(`页面元素不完整：${missingElements.join(', ')}`);
    } else {
        console.log('✅ 所有关键DOM元素检查通过');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM内容已加载，开始初始化...');
    console.log('[AppJS] build: monitor-fallback+handlers v1');

    try {
        // 检查关键DOM元素
        checkDOMElements();
        
        initializeApp();
        setupEventListeners();
        initializeCharts();
        initStudentMonitoring();

        // 开始检查模型加载状态
        checkModelLoadingStatus();

        console.log('应用初始化完成');
    } catch (error) {
        console.error('应用初始化失败:', error);
        hideModelLoadingOverlay(); // 即使出错也要隐藏加载遮罩
        showError('应用初始化失败: ' + error.message);
    }
});

function initializeApp() {
    console.log('初始化情绪分析系统...');

    // 检查URL参数中的模式设置，或根据访问地址智能判断默认模式
    const urlParams = new URLSearchParams(location.search);
    const modeFromURL = urlParams.get('mode');
    let targetMode = 'local'; // 默认本地模式
    
    if (modeFromURL && (modeFromURL === 'local' || modeFromURL === 'monitor')) {
        // URL参数明确指定了模式
        targetMode = modeFromURL;
        console.log(`从URL参数设置模式: ${modeFromURL}`);
    } else {
        // 根据访问地址智能判断默认模式
        const currentHost = location.hostname;
        const isLocalhost = currentHost === '127.0.0.1' || currentHost === 'localhost';
        const isLAN = /^192\.168\.\d+\.\d+$/.test(currentHost) || 
                     /^10\.\d+\.\d+\.\d+$/.test(currentHost) ||
                     currentHost.startsWith('172.');
        
        if (isLocalhost) {
            targetMode = 'local';
            console.log('检测到localhost访问，默认使用本地检测模式');
        } else if (isLAN) {
            targetMode = 'monitor';
            console.log('检测到局域网访问，默认使用学生监控模式');
        }
    }
    
    // 如果目标模式不是当前模式，则切换
    if (targetMode !== currentMode) {
        console.log(`切换到目标模式: ${targetMode}`);
        setTimeout(() => switchModeInternal(targetMode), 100);
    }

    // 连接WebSocket
    connectWebSocket();
    connectMonitorSocket();

    // 只在本地检测模式下检查浏览器音视频支持
    if (targetMode === 'local') {
        // 检查浏览器支持 - 更详细的检查
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('浏览器不支持现代媒体API');
            showError('您的浏览器不支持音视频采集功能，请使用现代浏览器访问');
            return;
        }
    } else {
        console.log('学生监控模式，跳过音视频支持检查');
    }

    // 检查环境并提供提示
    const isSecure = location.protocol === 'https:';
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isLAN = /^192\.168\.\d+\.\d+$/.test(location.hostname) || 
                 /^10\.\d+\.\d+\.\d+$/.test(location.hostname) ||
                 location.hostname.startsWith('172.');
    
    console.log('环境检查:', { isSecure, isLocal, isLAN, hostname: location.hostname });
    
    if (!isSecure && !isLocal && !isLAN) {
        console.warn('非安全环境，媒体功能可能受限');
        showNotification('建议在HTTPS环境或局域网下使用以获得最佳体验', 'warning');
    }

    updateUI();
}

// 检查模型加载状态
async function checkModelLoadingStatus() {
    console.log('开始检查模型加载状态...');

    const maxAttempts = 60; // 最多检查60次（约2分钟）
    let attempts = 0;

    const checkStatus = async () => {
        attempts++;

        try {
            const response = await fetch('/api/model_loading_status');
            const data = await response.json();

            if (data.success) {
                const { models_loaded, loading_status } = data;

                // 更新加载界面
                updateModelLoadingUI(loading_status);

                if (models_loaded) {
                    console.log('✅ 所有模型加载完成');
                    setTimeout(() => {
                        hideModelLoadingOverlay();
                    }, 1000); // 延迟1秒隐藏，让用户看到完成状态
                    return;
                }

                if (attempts >= maxAttempts) {
                    console.warn('模型加载超时，但继续运行');
                    hideModelLoadingOverlay();
                    showNotification('模型加载超时，系统将使用备用方案', 'warning');
                    return;
                }

                // 继续检查
                setTimeout(checkStatus, 1000);
            } else {
                throw new Error('获取模型状态失败');
            }
        } catch (error) {
            console.error('检查模型状态失败:', error);
            attempts++;

            if (attempts >= maxAttempts) {
                hideModelLoadingOverlay();
                showError('无法连接到服务器，请检查网络连接');
                return;
            }

            // 重试
            setTimeout(checkStatus, 2000);
        }
    };

    // 开始检查
    checkStatus();
}

// 更新模型加载界面
function updateModelLoadingUI(loadingStatus) {
    const subtitleElement = document.getElementById('loading-subtitle');
    const progressFillElement = document.getElementById('progress-fill');
    const progressTextElement = document.getElementById('progress-text');

    if (loadingStatus.loading) {
        if (subtitleElement) {
            subtitleElement.textContent = `正在加载: ${loadingStatus.current_model}`;
        }

        if (progressFillElement) {
            progressFillElement.style.width = `${loadingStatus.progress}%`;
        }

        if (progressTextElement) {
            progressTextElement.textContent = `${loadingStatus.progress}%`;
        }
    } else if (loadingStatus.error) {
        if (subtitleElement) {
            subtitleElement.textContent = `加载出错: ${loadingStatus.error}`;
            subtitleElement.style.color = '#ff6b6b';
        }

        if (progressTextElement) {
            progressTextElement.textContent = '使用备用方案';
            progressTextElement.style.color = '#ff6b6b';
        }
    } else {
        if (subtitleElement) {
            subtitleElement.textContent = '所有模型加载完成，系统已就绪！';
            subtitleElement.style.color = '#4ecdc4';
        }

        if (progressFillElement) {
            progressFillElement.style.width = '100%';
        }

        if (progressTextElement) {
            progressTextElement.textContent = '100%';
            progressTextElement.style.color = '#4ecdc4';
        }
    }
}

// 隐藏模型加载遮罩层
function hideModelLoadingOverlay() {
    const overlay = document.getElementById('model-loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
        console.log('模型加载遮罩层已隐藏');
    }
}

// 检查模型是否就绪
async function checkModelsReady() {
    try {
        const response = await fetch('/api/model_loading_status');
        const data = await response.json();

        if (data.success) {
            return {
                ready: data.models_loaded,
                status: data.loading_status
            };
        } else {
            return { ready: false, error: '无法获取模型状态' };
        }
    } catch (error) {
        console.error('检查模型状态失败:', error);
        return { ready: false, error: error.message };
    }
}

function connectWebSocket() {
    // 如果socket已存在且已连接，直接返回
    if (socket && socket.connected) {
        console.log('WebSocket已连接, ID:', socket.id);
        return;
    }
    
    try {
        // 检查Socket.IO是否可用
        if (typeof io === 'undefined') {
            console.error('Socket.IO库未加载！请检查网络连接');
            elements.connectionStatus.textContent = '连接失败';
            elements.connectionStatus.style.color = '#dc3545';
            showError('Socket.IO库加载失败，请刷新页面');
            return;
        }

        console.log('正在建立Socket.IO连接...');
        elements.connectionStatus.textContent = '连接中...';
        elements.connectionStatus.style.color = '#ffc107';

        // 清理旧连接
        if (socket) {
            try {
                socket.disconnect();
                socket = null;
            } catch (e) {
                console.warn('清理旧Socket连接失败:', e);
            }
        }

        socket = io({
            transports: ['websocket', 'polling'],
            timeout: 10000,
            forceNew: true
        });

        socket.on('connect', function() {
            clearTimeout(connectionTimeout); // 清除连接超时定时器
            console.log('[WebSocket] 连接成功, Socket ID:', socket.id);
            console.log('[调试] 教师端正常: WebSocket连接已建立，可以接收学生端数据');
            console.log('[调试] 当前连接URL:', socket.io.uri);
            elements.connectionStatus.textContent = '已连接';
            elements.connectionStatus.style.color = '#00d4ff';
            
            // 设置全局状态标记
            window.socketReady = true;
            
            // 测试WebSocket通信
            console.log('测试WebSocket通信...');
            
            // 添加测试按钮到刷新按钮旁边
            setTimeout(() => {
                const refreshBtn = document.getElementById('refreshStudents');
                if (refreshBtn && !document.getElementById('testSocketIO')) {
                    const testBtn = document.createElement('button');
                    testBtn.id = 'testSocketIO';
                    testBtn.className = 'btn-refresh';
                    testBtn.title = '测试Socket.IO连接';
                    testBtn.innerHTML = '<i class="fas fa-wifi"></i>';
                    testBtn.onclick = testSocketIOConnection;
                    refreshBtn.parentNode.appendChild(testBtn);
                }
            }, 1000);
        });

        socket.on('disconnect', function(reason) {
            console.log('[WebSocket] 连接断开, 原因:', reason);
            console.log('[调试] 教师端问题: WebSocket连接断开，无法接收学生端数据');
            elements.connectionStatus.textContent = '已断开';
            elements.connectionStatus.style.color = '#dc3545';
            
            // 清除全局状态标记
            window.socketReady = false;
            
            // 自动重连（避免某些断开原因）
            if (reason === 'io server disconnect') {
                console.log('服务器主动断开，尝试重新连接...');
                setTimeout(() => connectWebSocket(), 5000);
            }
        });
        
        socket.on('connect_error', function(error) {
            console.error('[WebSocket] 连接失败:', error);
            elements.connectionStatus.textContent = '连接失败';
            elements.connectionStatus.style.color = '#dc3545';
            showError('Socket.IO连接失败: ' + error.message);
            
            // 重试连接
            setTimeout(() => {
                console.log('尝试重新连接...');
                connectWebSocket();
            }, 5000);
        });
        
        // 连接超时检查
        const connectionTimeout = setTimeout(() => {
            if (!socket || !socket.connected) {
                console.error('Socket.IO连接超时');
                elements.connectionStatus.textContent = '连接超时';
                elements.connectionStatus.style.color = '#dc3545';
                showError('连接超时，请检查网络或刷新页面');
            }
        }, 15000);
        
        // 将连接成功处理合并到现有的connect监听器中
        
        // 移除旧的监听器，避免重复
        socket.off('audio_emotion_result');
        socket.off('audio_emotion_segment_result');
        socket.off('video_emotion_result');
        socket.off('heart_rate_result');
        socket.off('video_analysis_progress');
        socket.off('video_analysis_complete');
        socket.off('error');
        
        // 添加新的监听器
        socket.on('audio_emotion_result', handleAudioEmotionResult);
        socket.on('audio_emotion_segment_result', handleAudioEmotionSegmentResult);
        // 通用分析事件：在监控模式下桥接到学生事件处理器
        socket.on('video_emotion_result', (data) => {
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.session_id)) {
                    handleStudentVideoEmotionResult({
                        session_id: currentMonitoringStudent.session_id,
                        student_id: currentMonitoringStudent.student_id,
                        result: data.result
                    });
                } else {
                    handleVideoEmotionResult(data);
                }
            } catch (e) { console.warn('video_emotion_result handler error:', e); }
        });
        socket.on('heart_rate_result', (data) => {
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.session_id)) {
                    handleStudentHeartRateResult({
                        session_id: currentMonitoringStudent.session_id,
                        student_id: currentMonitoringStudent.student_id,
                        result: data.result
                    });
                } else {
                    handleHeartRateResult(data);
                }
            } catch (e) { console.warn('heart_rate_result handler error:', e); }
        });
        socket.on('video_analysis_progress', handleVideoAnalysisProgress);
        socket.on('video_analysis_complete', handleVideoAnalysisComplete);
        socket.on('error', handleSocketError);
        // 调试：打印所有事件到控制台
        try {
            if (socket && typeof socket.onAny === 'function') {
                // 打印默认命名空间所有事件，辅助诊断
                socket.onAny((event, payload) => {
                    console.log('[DEFAULT SOCKET ANY]', event, payload);
                });
            }

            // 主Socket也监听RTSP分析事件（双重保险）
            socket.on('rtsp_audio_analysis', (data) => {
                console.log('🎯 [主Socket收到语音情绪分析] rtsp_audio_analysis:', data);
                try {
                    if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                        const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                        if (data.stream_name === streamName) {
                            console.log('✅ [监控模式] 通过主Socket(备用)更新音频分析结果');
                            handleAudioEmotionResult({ result: data.result });
                        }
                    } else if (currentMode === 'local') {
                        console.log('✅ [本地模式] 通过主Socket(备用)更新音频分析结果');
                        handleAudioEmotionResult({ result: data.result });
                    }
                } catch (e) { console.warn('❌ 主Socket rtsp_audio_analysis handler error:', e); }
            });
            socket.on('video_emotion_result', (data) => {
                console.log('🎯 [主Socket收到视频情绪分析] video_emotion_result:', data);
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    console.log(`🔍 [主Socket] 比对流名称: 接收=${data.stream_name}, 期望=${streamName}`);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过主Socket更新视频分析结果');
                        updateVideoEmotionDisplay(data.result);
                    }
                } else if (currentMode === 'local') {
                    console.log('✅ [本地模式] 通过主Socket更新视频分析结果');
                    handleVideoEmotionResult(data);
                }
            });
            
            // 监听备用视频分析事件
            socket.on('rtsp_video_analysis', (data) => {
                console.log('🎯 [主Socket收到视频情绪分析] rtsp_video_analysis:', data);
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过主Socket(备用)更新视频分析结果');
                        updateVideoEmotionDisplay(data.result);
                    }
                } else if (currentMode === 'local') {
                    console.log('✅ [本地模式] 通过主Socket(备用)更新视频分析结果');
                    handleVideoEmotionResult(data);
                }
            });
            
            socket.on('heart_rate_result', (data) => {
                console.log('💓 [主Socket收到心率检测结果] heart_rate_result:', data);
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    console.log(`🔍 [主Socket] 比对心率流名称: 接收=${data.stream_name}, 期望=${streamName}`);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过主Socket更新心率结果');
                        updateHeartRateDisplay(data.result);
                    }
                } else if (currentMode === 'local') {
                    console.log('✅ [本地模式] 通过主Socket更新心率结果');
                    handleHeartRateResult(data);
                }
            });
            
            // 监听备用心率分析事件
            socket.on('rtsp_heart_rate_analysis', (data) => {
                console.log('💓 [主Socket收到心率检测结果] rtsp_heart_rate_analysis:', data);
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过主Socket(备用)更新心率结果');
                        updateHeartRateDisplay(data.result);
                    }
                } else if (currentMode === 'local') {
                    console.log('✅ [本地模式] 通过主Socket(备用)更新心率结果');
                    handleHeartRateResult(data);
                }
            });
            
        } catch (e) {
            console.error('设置事件监听失败:', e);
        }
        
    } catch (error) {
        console.error('WebSocket连接失败:', error);
        showError('无法连接到服务器');
    }
}

function setupEventListeners() {
    console.log('设置事件监听器...');

    // 主要控制按钮

    if (elements.saveRecordBtn) {
        elements.saveRecordBtn.addEventListener('click', saveCurrentRecord);
        console.log('✓ 保存记录按钮事件已绑定');
    }

    if (elements.clearHistoryBtn) {
        elements.clearHistoryBtn.addEventListener('click', clearHistory);
        console.log('✓ 清除历史按钮事件已绑定');
    }

    if (elements.detectionRecordsBtn) {
        elements.detectionRecordsBtn.addEventListener('click', openDetectionRecords);
        console.log('✓ 检测记录按钮事件已绑定');
    }

    // 文件上传
    if (elements.fileUpload) {
        elements.fileUpload.addEventListener('change', handleFileUpload);
        console.log('✓ 文件上传事件已绑定');
    }

    if (elements.uploadArea) {
        elements.uploadArea.addEventListener('dragover', handleDragOver);
        elements.uploadArea.addEventListener('drop', handleFileDrop);
        console.log('✓ 拖拽上传事件已绑定');
    }

    // 摄像头麦克风控制
    if (elements.startCameraMic) {
        elements.startCameraMic.addEventListener('click', startCameraMic);
        console.log('✓ 启动摄像头麦克风事件已绑定');
    }

    if (elements.stopDetection) {
        elements.stopDetection.addEventListener('click', stopDetection);
        console.log('✓ 停止检测事件已绑定');
    }

    // 趋势图控制
    if (elements.showAudioTrend) {
        elements.showAudioTrend.addEventListener('change', updateTrendChart);
    }
    if (elements.showVideoTrend) {
        elements.showVideoTrend.addEventListener('change', updateTrendChart);
    }
    if (elements.clearTrend) {
        elements.clearTrend.addEventListener('click', clearTrendData);
    }

    // 错误消息关闭
    const errorClose = document.querySelector('.error-close');
    if (errorClose) {
        errorClose.addEventListener('click', hideError);
        console.log('✓ 错误关闭按钮事件已绑定');
    }
}



function startMediaRecording() {
    try {
        console.log('开始启动音频录制...');

        // 检查媒体流是否存在
        if (!mediaStream) {
            throw new Error('媒体流不存在');
        }

        // 获取音频轨道
        const audioTracks = mediaStream.getAudioTracks();
        console.log('检测到音频轨道数量:', audioTracks.length);

        if (audioTracks.length === 0) {
            throw new Error('没有检测到音频轨道');
        }

        // 创建只包含音频的媒体流
        const audioStream = new MediaStream(audioTracks);

        // 检查浏览器支持的音频格式，优先选择更兼容的格式
        let mimeType = '';
        const supportedTypes = [
            'audio/webm;codecs=opus',
            'audio/webm;codecs=pcm', 
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4',
            'audio/wav'
        ];
        
        for (const type of supportedTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                console.log('选择音频格式:', type);
                break;
            }
        }
        
        if (!mimeType) {
            console.warn('浏览器不支持任何已知的音频格式，使用默认格式');
        }

        console.log('使用音频格式:', mimeType);

        // 创建音频录制器
        const options = mimeType ? { mimeType: mimeType } : {};
        mediaRecorder = new MediaRecorder(audioStream, options);

        mediaRecorder.ondataavailable = function(event) {
            console.log('收到音频数据，大小:', event.data.size, 'bytes');

            if (event.data.size > 0 && socket && socket.connected && currentSessionId) {
                // 将音频数据转换为base64发送
                const reader = new FileReader();
                reader.onload = function() {
                    console.log('发送音频数据到服务器，会话ID:', currentSessionId);
                    socket.emit('audio_data', {
                        session_id: currentSessionId,
                        audio_data: reader.result
                    });
                };
                reader.readAsDataURL(event.data);
            } else {
                if (event.data.size === 0) {
                    console.warn('音频数据为空');
                } else if (!socket || !socket.connected) {
                    console.warn('Socket连接未就绪');
                } else if (!currentSessionId) {
                    console.warn('会话ID未设置');
                }
            }
        };

        mediaRecorder.onerror = function(event) {
            console.error('音频录制错误:', event.error);
        };

        mediaRecorder.onstart = function() {
            console.log('音频录制已开始');
        };

        mediaRecorder.onstop = function() {
            console.log('音频录制已停止');
        };

        // 每3秒发送一次音频数据
        mediaRecorder.start(3000);
        console.log('音频录制器启动成功');

    } catch (error) {
        console.error('启动媒体录制失败:', error);
        showError('音频录制启动失败: ' + error.message);
    }
}

function startVideoAnalysis() {
    const canvas = elements.videoCanvas;
    const context = canvas.getContext('2d');
    const video = elements.videoPreview;
    
    canvas.width = 640;
    canvas.height = 480;
    
    function captureFrame() {
        if (!isRecording) {
            console.log('录制已停止，停止视频帧捕获');
            return;
        }
        
        // 检查视频是否准备就绪
        if (!video.videoWidth || !video.videoHeight) {
            console.log('视频尺寸未准备就绪，等待后重试...');
            // 视频还没准备好，等待500ms后重试
            setTimeout(captureFrame, 500);
            return;
        }
        
        try {
            // 绘制视频帧到canvas
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // 获取图像数据
            canvas.toBlob(function(blob) {
                if (blob && socket && currentSessionId) {
                    const reader = new FileReader();
                    reader.onload = function() {
                        socket.emit('video_frame', {
                            session_id: currentSessionId,
                            frame_data: reader.result
                        });
                    };
                    reader.readAsDataURL(blob);
                } else {
                    console.log('Socket或会话ID未准备就绪');
                }
            }, 'image/jpeg', 0.8);
            
        } catch (error) {
            console.error('视频帧捕获失败:', error);
        }
        
        // 每1秒分析一次 - 实时更新
        if (isRecording) {
            setTimeout(captureFrame, 1000);
        }
    }
    
    // 改进的视频准备就绪检测
    function waitForVideoReady() {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            console.log('视频已准备就绪，开始帧捕获');
            console.log('视频尺寸:', video.videoWidth + 'x' + video.videoHeight);
            // 立即开始第一次捕获
            setTimeout(captureFrame, 100);
        } else {
            console.log('等待视频准备就绪...');
            // 继续等待
            setTimeout(waitForVideoReady, 200);
        }
    }
    
    // 多种事件监听确保视频准备就绪
    video.addEventListener('loadeddata', function() {
        console.log('视频loadeddata事件触发');
        waitForVideoReady();
    });
    
    video.addEventListener('loadedmetadata', function() {
        console.log('视频loadedmetadata事件触发');
        waitForVideoReady();
    });
    
    video.addEventListener('canplay', function() {
        console.log('视频canplay事件触发');
        waitForVideoReady();
    });
    
    // 备用：如果事件没有触发，定时检查
    setTimeout(waitForVideoReady, 1000);
}

function startAudioVisualization() {
    const canvas = elements.audioCanvas;
    const context = canvas.getContext('2d');
    const audioLevelElement = document.getElementById('audio-level');
    
    // 确保audio-visualizer容器具有相对定位
    const audioVisualizer = canvas.closest('.audio-visualizer');
    if (audioVisualizer) {
        audioVisualizer.style.position = 'relative';
    }
    
    // 移除旧的音频状态指示器（如果存在）
    const existingIndicator = document.getElementById('audio-status-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // 添加音频状态指示器
    const audioStatusIndicator = document.createElement('div');
    audioStatusIndicator.id = 'audio-status-indicator';
    audioStatusIndicator.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ff0000;
        transition: all 0.3s ease;
        z-index: 1001;
        box-shadow: 0 0 8px rgba(255, 0, 0, 0.6);
        border: 2px solid rgba(255, 255, 255, 0.3);
    `;
    
    // 将指示器添加到audio-visualizer容器中
    if (audioVisualizer) {
        audioVisualizer.appendChild(audioStatusIndicator);
    } else {
        canvas.parentElement.style.position = 'relative';
        canvas.parentElement.appendChild(audioStatusIndicator);
    }

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(mediaStream);

        source.connect(analyser);
        analyser.fftSize = 512; // 增加频率分辨率
        analyser.smoothingTimeConstant = 0.3; // 减少平滑以增加响应性
        analyser.minDecibels = -90; // 更好的动态范围
        analyser.maxDecibels = -10;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // 设置canvas尺寸
        canvas.width = canvas.offsetWidth || 300;
        canvas.height = canvas.offsetHeight || 40;
        
        // 添加debug信息
        console.log('音频可视化初始化 - Canvas尺寸:', canvas.width, 'x', canvas.height);
        console.log('音频可视化初始化 - 频率bin数量:', bufferLength);

        function draw() {
            if (!isRecording) return;

            requestAnimationFrame(draw);

            analyser.getByteFrequencyData(dataArray);

            // 清除画布
            context.fillStyle = '#1a1a1a';
            context.fillRect(0, 0, canvas.width, canvas.height);

            // 计算音频强度 - 改进的算法
            let sum = 0;
            let peak = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
                peak = Math.max(peak, dataArray[i]);
            }
            const average = sum / bufferLength;
            const normalizedAverage = average / 255;
            const normalizedPeak = peak / 255;
            
            // 使用加权平均来获得更好的音频级别
            const audioLevel = ((normalizedAverage * 0.7) + (normalizedPeak * 0.3)) * 100;
            
            // 应用非线性缩放来提高敏感度
            const scaledAudioLevel = Math.pow(audioLevel / 100, 0.5) * 100;
            
            // 添加debug日志（每秒一次）
            if (!draw.lastLogTime || Date.now() - draw.lastLogTime > 1000) {
                console.log(`音频级别 - 原始: ${audioLevel.toFixed(1)}%, 缩放: ${scaledAudioLevel.toFixed(1)}%, 峰值: ${(normalizedPeak * 100).toFixed(1)}%`);
                draw.lastLogTime = Date.now();
            }

            // 更新音频强度条
            if (audioLevelElement) {
                audioLevelElement.style.setProperty('--audio-level', Math.min(scaledAudioLevel, 100) + '%');
                
                // 添加或更新峰值指示器
                let peakIndicator = audioLevelElement.querySelector('.peak-indicator');
                if (!peakIndicator) {
                    peakIndicator = document.createElement('div');
                    peakIndicator.className = 'peak-indicator';
                    peakIndicator.style.cssText = `
                        position: absolute;
                        top: 0;
                        height: 100%;
                        width: 2px;
                        background: #ffffff;
                        transition: left 0.1s ease-out;
                        box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
                        z-index: 2;
                    `;
                    audioLevelElement.style.position = 'relative';
                    audioLevelElement.appendChild(peakIndicator);
                }
                
                // 更新峰值位置
                const peakPosition = Math.min(normalizedPeak * 100, 100);
                peakIndicator.style.left = peakPosition + '%';
                
                // 根据音频级别改变颜色主题
                if (scaledAudioLevel > 15) {
                    audioLevelElement.style.setProperty('--level-color-start', '#00ff00');
                    audioLevelElement.style.setProperty('--level-color-end', '#00aa00');
                } else if (scaledAudioLevel > 5) {
                    audioLevelElement.style.setProperty('--level-color-start', '#ffff00');
                    audioLevelElement.style.setProperty('--level-color-end', '#ffaa00');
                } else {
                    audioLevelElement.style.setProperty('--level-color-start', '#00ffff');
                    audioLevelElement.style.setProperty('--level-color-end', '#ff00ff');
                }
            }
            
            // 更新音频状态指示器 - 降低阈值提高敏感度
            const audioStatusIndicator = document.getElementById('audio-status-indicator');
            if (audioStatusIndicator) {
                if (scaledAudioLevel > 8) {
                    // 绿色表示有足够的音频输入
                    audioStatusIndicator.style.background = '#00ff00';
                    audioStatusIndicator.style.boxShadow = '0 0 12px rgba(0, 255, 0, 0.8)';
                } else if (scaledAudioLevel > 3) {
                    // 黄色表示微弱音频
                    audioStatusIndicator.style.background = '#ffff00';
                    audioStatusIndicator.style.boxShadow = '0 0 10px rgba(255, 255, 0, 0.6)';
                } else {
                    // 红色表示无音频或音频太弱
                    audioStatusIndicator.style.background = '#ff0000';
                    audioStatusIndicator.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.6)';
                }
                
                // 添加实时音量数值显示
                const volumeText = audioStatusIndicator.querySelector('.volume-text');
                if (volumeText) {
                    volumeText.textContent = scaledAudioLevel.toFixed(1);
                }
            }

            // 绘制频谱 - 改进的可视化
            const barWidth = canvas.width / bufferLength;
            const minBarHeight = 2; // 最小条高度，确保有基线
            let x = 0;

            // 第一遍：绘制主要频谱条
            for (let i = 0; i < bufferLength; i++) {
                // 应用非线性缩放以获得更好的视觉效果
                const normalizedValue = dataArray[i] / 255;
                const scaledValue = Math.pow(normalizedValue, 0.6); // 压缩动态范围
                const barHeight = Math.max(scaledValue * canvas.height * 0.85, minBarHeight);

                // 根据频率创建不同的颜色
                const hue = (i / bufferLength) * 240; // 从蓝色到红色
                const saturation = 80 + (scaledValue * 20); // 动态饱和度
                const lightness = 40 + (scaledValue * 40); // 动态亮度
                
                // 创建动态渐变色
                const gradient = context.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
                gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`);
                gradient.addColorStop(0.6, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
                gradient.addColorStop(1, `hsl(${hue}, ${saturation - 20}%, ${lightness - 10}%)`);

                context.fillStyle = gradient;
                context.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

                x += barWidth;
            }

            // 添加发光效果
            context.shadowColor = scaledAudioLevel > 15 ? '#00ff00' : scaledAudioLevel > 5 ? '#ffff00' : '#00ffff';
            context.shadowBlur = 6 + (scaledAudioLevel / 100) * 8; // 动态模糊
            context.globalCompositeOperation = 'lighter';

            // 第二遍：发光效果
            x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const normalizedValue = dataArray[i] / 255;
                const scaledValue = Math.pow(normalizedValue, 0.6);
                const barHeight = Math.max(scaledValue * canvas.height * 0.85, minBarHeight);
                
                const intensity = scaledValue * 0.4;
                context.fillStyle = `rgba(0, 255, 255, ${intensity})`;
                context.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
                x += barWidth;
            }

            // 重置合成模式
            context.globalCompositeOperation = 'source-over';
            context.shadowBlur = 0;
        }

        draw();

    } catch (error) {
        console.error('音频可视化失败:', error);
    }
}

// 情绪翻译函数
function translateEmotion(emotion) {
    return emotionTranslations[emotion] || emotion;
}

// 计时器管理函数
function startAnalysisTimer() {
    console.log('启动分析计时器');
    
    // 清除可能存在的旧计时器
    if (analysisTimer) {
        clearInterval(analysisTimer);
        analysisTimer = null;
    }
    
    // 设置开始时间
    sessionStartTime = Date.now();
    
    // 立即更新一次显示
    updateAnalysisTime();
    
    // 启动新的计时器
    analysisTimer = setInterval(updateAnalysisTime, 1000);
}

function stopAnalysisTimer() {
    console.log('停止分析计时器');
    
    // 清除计时器
    if (analysisTimer) {
        clearInterval(analysisTimer);
        analysisTimer = null;
    }
}

function resetAnalysisTimer() {
    console.log('重置分析计时器');
    
    // 停止当前计时器
    stopAnalysisTimer();
    
    // 重置开始时间
    sessionStartTime = null;
    
    // 重置显示为00:00
    if (elements.analysisTime) {
        elements.analysisTime.textContent = '00:00';
    }
}

// 更新分析时长显示
function updateAnalysisTime() {
    if (sessionStartTime && elements.analysisTime) {
        const elapsed = Date.now() - sessionStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        elements.analysisTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function handleAudioEmotionResult(data) {
    console.log('✅ 前端收到语音情绪分析结果:', data);
    console.log('语音详情:', JSON.stringify(data, null, 2));

    const result = data.result;

    // 检查是否有音频数据
    if (result.no_audio || result.using_fake_data) {
        console.log('视频无音频轨道，跳过语音情绪分析');
        // 显示无音频状态
        if (elements.audioDominantEmotion) {
            elements.audioDominantEmotion.textContent = '无音频';
        }
        if (elements.audioDetectionStatus) {
            elements.audioDetectionStatus.textContent = '无音频轨道';
        }
        return; // 不更新图表和其他数据
    }
    
    // 检查分析质量并显示警告
    if (result.analysis_quality === 'low') {
        console.warn('⚠️ 语音分析使用备用方案，准确度可能较低');
        showNotification('⚠️ 语音分析使用备用方案，准确度可能较低', 'warning');
    } else if (result.analysis_quality === 'emergency') {
        console.warn('⚠️ 语音分析使用紧急备用方案');
        showNotification('⚠️ 语音分析使用紧急备用方案', 'warning');
    }

    updateAudioEmotionChart(result.emotions);
    updateAudioEmotionResult({
        dominant: result.dominant_emotion,
        model: result.model,
        quality: result.analysis_quality
    });
    updateTrendData('audio', result.dominant_emotion, result.timestamp);
    updateAnalysisCount();

    // 更新综合评估
    updateComprehensiveAssessment({
        audio_emotion: {
            dominant: result.dominant_emotion,
            confidence: result.confidence,
            quality: result.analysis_quality
        }
    });
}

function handleVideoEmotionResult(data) {
    console.log('✅ 前端收到面部情绪分析结果:', data);
    console.log('结果详情:', JSON.stringify(data, null, 2));

    const result = data.result;
    
    // 只有检测到人脸时才更新情绪分析结果
    if (result.face_detected) {
        updateVideoEmotionChart(result.emotions);
        updateVideoEmotionResult({
            dominant: result.dominant_emotion
        });
        updateTrendData('video', result.dominant_emotion, result.timestamp);
        updateAnalysisCount();

        // 更新综合评估
        updateComprehensiveAssessment({
            video_emotion: {
                dominant: result.dominant_emotion,
                confidence: result.confidence
            }
        });
    } else {
        // 无人脸时重置面部情绪显示
        if (elements.videoDominantEmotion) {
            elements.videoDominantEmotion.textContent = '--';
        }
        if (elements.videoDetectionStatus) {
            elements.videoDetectionStatus.textContent = '待检测';
        }
        console.log('未检测到人脸，重置面部情绪显示');
    }
    
    // 始终更新人脸检测状态指示器
    updateFaceDetectionIndicator(result.face_detected);
}

function handleHeartRateResult(data) {
    console.log('✅ 前端收到心率检测结果:', data);
    console.log('心率详情:', JSON.stringify(data, null, 2));

    const result = data.result;

    // 更新界面显示（心率数据更新逻辑已移到updateHeartRateDisplay函数中）
    updateHeartRateDisplay(result);
}

function updateHeartRateDisplay(result) {
    try {
        console.log('更新增强心率显示:', result);

        // 获取检测状态和进度信息
        const faceDetected = result.face_detected;
        const heartRate = result.heart_rate;
        const detectionState = result.detection_state || 'waiting';
        const progressInfo = result.progress_info || {};
        
        // 确保心率显示框可见
        if (elements.heartRateDisplay) {
            elements.heartRateDisplay.style.display = 'flex';
        }

        // 根据检测状态更新显示
        switch (detectionState) {
            case 'waiting':
                // 等待状态：显示 -- 和隐藏进度条
                updateHeartRateValue('--');
                hideProgressBar();
                console.log('心率检测状态: 等待人脸检测');
                break;
                
            case 'counting':
                // 倒计时状态：显示 -- 和进度条
                updateHeartRateValue('--');
                showProgressBar(progressInfo);
                console.log('心率检测状态: 倒计时中', progressInfo);
                break;
                
            case 'calculating':
                // 计算状态：显示心率值或 -- （如果还没计算出来）
                if (heartRate !== undefined && heartRate !== null && heartRate > 0) {
                    updateHeartRateValue(heartRate);
                    
                    // 更新心率历史数据
                    heartRateData.currentHeartRate = heartRate;
                    heartRateData.history.push({
                        timestamp: new Date().toISOString(),
                        heart_rate: heartRate
                    });
                    
                    // 限制历史数据长度
                    if (heartRateData.history.length > 100) {
                        heartRateData.history.shift();
                    }
                    
                    console.log('心率数值已更新:', heartRate, 'BPM');
                } else {
                    updateHeartRateValue('--');
                    console.log('计算状态但心率值无效');
                }
                
                // 显示进度条（显示"实时监测"状态）
                showProgressBar(progressInfo);
                break;
                
            case 'error':
            default:
                // 错误状态：显示 -- 和隐藏进度条
                updateHeartRateValue('--');
                hideProgressBar();
                console.log('心率检测状态: 错误或未知状态');
                break;
        }

    } catch (error) {
        console.error('更新心率显示失败:', error);
        // 出错时显示默认状态
        updateHeartRateValue('--');
        hideProgressBar();
    }
}

function updateHeartRateValue(value) {
    if (elements.heartRateValue) {
        elements.heartRateValue.textContent = value;
    }
}

// 重置心率检测显示到初始状态
function resetHeartRateDisplay() {
    try {
        console.log('重置心率检测显示...');
        
        // 重置心率数据
        heartRateData.currentHeartRate = 0;
        heartRateData.history = [];
        heartRateData.confidence = 0;
        heartRateData.quality = 'waiting';
        
        // 重置显示值为初始状态
        if (elements.heartRateValue) {
            elements.heartRateValue.textContent = '--';
        }
        
        // 隐藏进度条
        hideProgressBar();
        
        // 重置心率图标状态
        if (elements.heartRateIcon) {
            elements.heartRateIcon.className = 'fas fa-heartbeat';
            elements.heartRateIcon.style.color = '';
        }
        
        console.log('心率检测显示已重置');
    } catch (error) {
        console.error('重置心率显示失败:', error);
    }
}

function showProgressBar(progressInfo) {
    try {
        if (!elements.heartRateProgress) return;
        
        elements.heartRateProgress.style.display = 'block';
        
        // 更新进度条
        if (elements.progressFill && progressInfo.progress_percent !== undefined) {
            elements.progressFill.style.width = `${progressInfo.progress_percent}%`;
        }
        
        // 更新进度文本
        if (elements.progressText && progressInfo.message) {
            elements.progressText.textContent = progressInfo.message;
        }
        
        // 如果是倒计时状态，显示剩余秒数
        if (progressInfo.countdown_active && progressInfo.remaining_seconds !== undefined) {
            if (elements.progressText) {
                elements.progressText.textContent = `心率计算中... ${progressInfo.remaining_seconds}秒`;
            }
        }
        
    } catch (error) {
        console.error('显示进度条失败:', error);
    }
}

function hideProgressBar() {
    try {
        if (elements.heartRateProgress) {
            elements.heartRateProgress.style.display = 'none';
        }
        
        // 重置进度条
        if (elements.progressFill) {
            elements.progressFill.style.width = '0%';
        }
        
    } catch (error) {
        console.error('隐藏进度条失败:', error);
    }
}

function initializeHeartRateDisplay() {
    try {
        console.log('初始化增强心率检测显示...');

        // 重置心率数据
        heartRateData.currentHeartRate = 0;
        heartRateData.history = [];

        // 显示心率检测框
        if (elements.heartRateDisplay) {
            elements.heartRateDisplay.style.display = 'flex';
        }

        // 初始化显示内容 - 显示等待状态
        updateHeartRateValue('--');
        hideProgressBar();

        console.log('增强心率检测显示初始化完成，等待3秒倒计时...');

    } catch (error) {
        console.error('心率显示初始化失败:', error);
    }
}

function hideHeartRateDisplay() {
    try {
        if (elements.heartRateDisplay) {
            elements.heartRateDisplay.style.display = 'none';
        }

        // 重置心率数据
        heartRateData.currentHeartRate = 0;
        heartRateData.history = [];
        heartRateData.confidence = 0;
        heartRateData.quality = 'stopped';

        // 隐藏进度条
        hideProgressBar();

        console.log('增强心率检测显示已隐藏');

    } catch (error) {
        console.error('隐藏心率显示失败:', error);
    }
}

function handleSocketError(data) {
    console.error('Socket错误:', data);
    showError(data.message);
}

function handleVideoAnalysisProgress(data) {
    console.log('视频分析进度:', data);

    // 更新进度显示
    if (data.message) {
        updateAnalysisStatus(data.message);
    }

    // 如果有进度百分比，可以显示进度条
    if (data.progress !== undefined) {
        console.log(`分析进度: ${data.progress.toFixed(1)}%`);
    }
}

function handleVideoAnalysisComplete(data) {
    console.log('视频分析完成:', data);

    // 标记分析已完成，但不立即询问保存
    window.videoAnalysisCompleted = true;

    // 更新状态显示
    updateAnalysisStatus('视频分析完成');

    // 如果视频已经播放结束，才询问保存
    if (window.videoPlaybackEnded) {
        isVideoAnalyzing = false;
        stopAnalysisTimer();
        showNotification('视频分析完成', 'success');
        
        setTimeout(() => {
            if (!window.videoDataSaved) {
                window.videoDataSaved = true;
                confirmAndSaveRecord();
            }
        }, 1000);
    }
}

function updateUI() {
    if (isRecording) {
        elements.saveRecordBtn.disabled = false;

        // 更新系统状态
        if (elements.sessionId) {
            elements.sessionId.textContent = currentSessionId || '-';
        }

        // 更新检测状态
        if (elements.faceDetectionStatus) {
            elements.faceDetectionStatus.innerHTML = '<i class="fas fa-search"></i><span>正在分析...</span>';
        }

        // 更新连接状态
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '分析中';
        }
    } else {
        elements.saveRecordBtn.disabled = true;

        // 重置系统状态
        if (elements.sessionId) {
            elements.sessionId.textContent = '-';
        }

        // 重置检测状态
        if (elements.faceDetectionStatus) {
            elements.faceDetectionStatus.innerHTML = '<i class="fas fa-search"></i><span>等待开始分析...</span>';
        }

        // 重置连接状态
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '系统在线';
        }

        // 重置分析计数
        if (elements.analysisCount) {
            elements.analysisCount.textContent = '0';
        }

        // 重置会话时长
        if (elements.sessionDuration) {
            elements.sessionDuration.textContent = '00:00';
        }
    }
}

function showError(message, persistent = false) {
    console.error('Error:', message);
    
    const errorText = elements.errorMessage.querySelector('.error-text');
    errorText.textContent = message;
    elements.errorMessage.style.display = 'flex';
    elements.errorMessage.className = 'error-message error-level-error';
    
    // 根据错误严重程度决定显示时间
    const hideDelay = persistent ? 10000 : 5000;
    setTimeout(hideError, hideDelay);
    
    // 记录错误到本地存储
    try {
        const errorLog = JSON.parse(localStorage.getItem('emotion_errors') || '[]');
        errorLog.push({
            message: message,
            timestamp: new Date().toISOString(),
            persistent: persistent
        });
        
        if (errorLog.length > 50) {
            errorLog.splice(0, errorLog.length - 50);
        }
        
        localStorage.setItem('emotion_errors', JSON.stringify(errorLog));
    } catch (e) {
        console.warn('无法保存错误日志:', e);
    }
}

function showWarning(message) {
    console.warn('Warning:', message);
    
    const errorText = elements.errorMessage.querySelector('.error-text');
    errorText.textContent = message;
    elements.errorMessage.style.display = 'flex';
    elements.errorMessage.className = 'error-message error-level-warning';
    
    setTimeout(hideError, 4000);
}

function hideError() {
    elements.errorMessage.style.display = 'none';
}

function initializeCharts() {
    console.log('开始初始化图表...');

    try {
        // 检查Chart.js是否可用
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js未加载，跳过图表初始化');
            return;
        }

        // 定义统一的情绪颜色映射 - 支持9类情绪
        const emotionColors = {
            'angry': '#dc3545',    // 红色 - 愤怒
            'disgusted': '#6f42c1', // 紫色 - 厌恶
            'fearful': '#fd7e14',  // 橙色 - 恐惧
            'happy': '#28a745',    // 绿色 - 快乐
            'neutral': '#6c757d',  // 灰色 - 中性
            'other': '#e83e8c',    // 粉色 - 其他
            'sad': '#17a2b8',      // 蓝色 - 悲伤
            'surprised': '#ffc107', // 黄色 - 惊讶
            'unknown': '#343a40',  // 深灰色 - 未知
            // 兼容旧版本
            'surprise': '#ffc107',
            'fear': '#fd7e14',
            'disgust': '#6f42c1'
        };

        // 初始化语音情绪图表 - 支持9类情绪
        const audioCanvas = document.getElementById('audio-emotion-chart');
        if (audioCanvas) {
            const audioCtx = audioCanvas.getContext('2d');
            audioEmotionChart = new Chart(audioCtx, {
                type: 'doughnut',
                data: {
                    labels: ['愤怒', '厌恶', '恐惧', '快乐', '中性', '其他', '悲伤', '惊讶', '未知'],
                    datasets: [{
                        data: [0, 0, 0, 0, 100, 0, 0, 0, 0],
                        backgroundColor: [
                            emotionColors.angry,
                            emotionColors.disgusted,
                            emotionColors.fearful,
                            emotionColors.happy,
                            emotionColors.neutral,
                            emotionColors.other,
                            emotionColors.sad,
                            emotionColors.surprised,
                            emotionColors.unknown
                        ],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 10,
                                font: {
                                    size: 11
                                },
                                color: '#ffffff'  // 设置标识文字颜色为白色
                            }
                        }
                    }
                }
            });
            console.log('✓ 语音情绪图表初始化成功');
        } else {
            console.warn('✗ 找不到语音情绪图表canvas元素');
        }

        // 初始化面部情绪图表
        const videoCanvas = document.getElementById('video-emotion-chart');
        if (videoCanvas) {
            const videoCtx = videoCanvas.getContext('2d');
            videoEmotionChart = new Chart(videoCtx, {
                type: 'doughnut',
                data: {
                    labels: ['快乐', '悲伤', '愤怒', '惊讶', '恐惧', '厌恶', '中性'],
                    datasets: [{
                        data: [0, 0, 0, 0, 0, 0, 100],
                        backgroundColor: [
                            emotionColors.happy,
                            emotionColors.sad,
                            emotionColors.angry,
                            emotionColors.surprised,
                            emotionColors.fearful,
                            emotionColors.disgusted,
                            emotionColors.neutral
                        ],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 8,
                                font: {
                                    size: 10
                                },
                                color: '#ffffff'  // 设置标识文字颜色为白色
                            }
                        }
                    }
                }
            });
            console.log('✓ 面部情绪图表初始化成功');
        } else {
            console.warn('✗ 找不到面部情绪图表canvas元素');
        }

        // 初始化趋势图表
        const trendCanvas = document.getElementById('emotion-trend-chart');
        if (trendCanvas) {
            const trendCtx = trendCanvas.getContext('2d');
            emotionTrendChart = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: '语音情绪',
                        data: [],
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4,
                        fill: true
                    }, {
                        label: '面部情绪',
                        data: [],
                        borderColor: '#764ba2',
                        backgroundColor: 'rgba(118, 75, 162, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 1,
                            title: {
                                display: true,
                                text: '情绪强度'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: '时间'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top'
                        }
                    }
                }
            });
            console.log('✓ 趋势图表初始化成功');
        } else {
            console.warn('✗ 找不到趋势图表canvas元素');
        }

        console.log('图表初始化完成');

    } catch (error) {
        console.error('图表初始化失败:', error);
        // 不抛出错误，让应用继续运行
    }
}

function updateAudioEmotionChart(emotions) {
    if (!audioEmotionChart) return;

    // 固定的标签顺序，与初始化时保持完全一致 - 支持9类情绪
    const fixedLabels = ['愤怒', '厌恶', '恐惧', '快乐', '中性', '其他', '悲伤', '惊讶', '未知'];
    const emotionKeyMap = {
        '愤怒': 'angry',
        '厌恶': 'disgusted',
        '恐惧': 'fearful',
        '快乐': 'happy',
        '中性': 'neutral',
        '其他': 'other',
        '悲伤': 'sad',
        '惊讶': 'surprised',
        '未知': 'unknown'
    };

    // 按照固定顺序构建数据数组
    const data = fixedLabels.map(label => {
        const emotionKey = emotionKeyMap[label];
        const value = emotions[emotionKey] || 0;
        return (value * 100).toFixed(1);
    });

    // 不更改labels，保持与初始化时的顺序一致
    audioEmotionChart.data.datasets[0].data = data;
    audioEmotionChart.update();
}

function updateVideoEmotionChart(emotions) {
    if (!videoEmotionChart) return;

    // 固定的标签顺序，与初始化时保持完全一致
    const fixedLabels = ['快乐', '悲伤', '愤怒', '惊讶', '恐惧', '厌恶', '中性'];
    const emotionKeyMap = {
        '快乐': 'happy',
        '悲伤': 'sad',
        '愤怒': 'angry', 
        '惊讶': 'surprise',
        '恐惧': 'fear',
        '厌恶': 'disgust',
        '中性': 'neutral'
    };

    // 按照固定顺序构建数据数组
    const data = fixedLabels.map(label => {
        const emotionKey = emotionKeyMap[label];
        const value = emotions[emotionKey] || 0;
        return (value * 100).toFixed(1);
    });

    // 不更改labels，保持与初始化时的顺序一致
    videoEmotionChart.data.datasets[0].data = data;
    videoEmotionChart.update();
}

function updateEmotionDetails(type, dominantEmotion, confidence) {
    const emotionMap = {
        'angry': '愤怒',
        'disgusted': '厌恶',
        'fearful': '恐惧',
        'happy': '快乐',
        'neutral': '中性',
        'other': '其他',
        'sad': '悲伤',
        'surprised': '惊讶',
        'unknown': '未知',
        // 兼容旧版本
        'surprise': '惊讶',
        'fear': '恐惧',
        'disgust': '厌恶'
    };

    const emotionElement = document.getElementById(`${type}-dominant-emotion`);
    const confidenceElement = document.getElementById(`${type}-confidence`);

    if (emotionElement) {
        const emotionValue = emotionElement.querySelector('.emotion-value');
        emotionValue.textContent = emotionMap[dominantEmotion] || dominantEmotion;
    }

    if (confidenceElement) {
        const confidenceValue = confidenceElement.querySelector('.confidence-value');
        confidenceValue.textContent = `${(confidence * 100).toFixed(1)}%`;
    }
}

function updateTrendData(type, emotion, timestamp) {
    const time = new Date(timestamp).toLocaleTimeString();

    // 情绪强度映射 - 支持9类情绪
    const emotionIntensity = {
        'angry': 0.9,
        'disgusted': 0.7,
        'fearful': 0.8,
        'happy': 0.8,
        'neutral': 0.3,
        'other': 0.5,
        'sad': 0.6,
        'surprised': 0.7,
        'unknown': 0.2,
        // 兼容旧版本
        'surprise': 0.7,
        'fear': 0.8,
        'disgust': 0.7
    };

    const intensity = emotionIntensity[emotion] || 0.5;

    // 添加新数据点
    emotionTrendData.labels.push(time);

    if (type === 'audio') {
        emotionTrendData.audioData.push(intensity);
        emotionTrendData.videoData.push(emotionTrendData.videoData[emotionTrendData.videoData.length - 1] || 0);
    } else {
        emotionTrendData.videoData.push(intensity);
        emotionTrendData.audioData.push(emotionTrendData.audioData[emotionTrendData.audioData.length - 1] || 0);
    }

    // 限制数据点数量
    const maxPoints = 20;
    if (emotionTrendData.labels.length > maxPoints) {
        emotionTrendData.labels.shift();
        emotionTrendData.audioData.shift();
        emotionTrendData.videoData.shift();
    }

    updateTrendChart();
}

function updateTrendChart() {
    if (!emotionTrendChart) return;

    const showAudio = document.getElementById('show-audio-trend').checked;
    const showVideo = document.getElementById('show-video-trend').checked;

    emotionTrendChart.data.labels = emotionTrendData.labels;
    emotionTrendChart.data.datasets[0].data = showAudio ? emotionTrendData.audioData : [];
    emotionTrendChart.data.datasets[1].data = showVideo ? emotionTrendData.videoData : [];

    emotionTrendChart.update();
}

function clearTrendData() {
    emotionTrendData.labels = [];
    emotionTrendData.audioData = [];
    emotionTrendData.videoData = [];
    updateTrendChart();
}

// 清除历史数据功能
function clearHistory() {
    console.log('清除历史数据...');

    try {
        // 停止并清除视频
        if (elements.videoPreview) {
            elements.videoPreview.pause();
            elements.videoPreview.src = '';
            elements.videoPreview.style.display = 'none';
        }
        
        // 清除画布
        if (elements.videoCanvas) {
            const ctx = elements.videoCanvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, elements.videoCanvas.width, elements.videoCanvas.height);
            }
            elements.videoCanvas.style.display = 'none';
        }
        
        // 重置视频相关状态
        isVideoAnalyzing = false;
        uploadedVideoInfo = null;
        window.videoDataSaved = false;
        
        // 重置分析计数
        analysisCount = 0;
        if (elements.analysisCount) {
            elements.analysisCount.textContent = '0';
        }

        // 重置面部情绪分析结果
        if (elements.videoDominantEmotion) {
            elements.videoDominantEmotion.textContent = '--';
        }
        if (elements.videoDetectionStatus) {
            elements.videoDetectionStatus.textContent = '待检测';
        }

        // 重置语音情绪分析结果
        if (elements.audioDominantEmotion) {
            elements.audioDominantEmotion.textContent = '--';
        }
        if (elements.audioDetectionStatus) {
            elements.audioDetectionStatus.textContent = '待检测';
        }

        // 重置综合情绪评估
        if (elements.overallEmotion) {
            elements.overallEmotion.textContent = '--';
        }
        if (elements.emotionIntensity) {
            elements.emotionIntensity.textContent = '--';
        }
        if (elements.emotionConsistency) {
            elements.emotionConsistency.textContent = '--';
        }
        if (elements.emotionIcon) {
            elements.emotionIcon.textContent = '😐';
        }

        // 重置情绪图表 - 支持9类情绪
        if (audioEmotionChart) {
            audioEmotionChart.data.datasets[0].data = [0, 0, 0, 0, 100, 0, 0, 0, 0]; // 默认中性100%
            audioEmotionChart.update();
        }

        if (videoEmotionChart) {
            videoEmotionChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 100]; // 默认中性100%
            videoEmotionChart.update();
        }

        // 清除趋势数据
        clearTrendData();

        // 重置检测状态显示
        if (elements.faceDetectionStatus) {
            elements.faceDetectionStatus.innerHTML = '<i class="fas fa-search"></i><span>等待开始分析...</span>';
            elements.faceDetectionStatus.style.color = '';
        }

        // 重置心率检测显示
        resetHeartRateDisplay();

        // 重置计时器
        resetAnalysisTimer();

        showNotification('历史数据已清除', 'success');
        console.log('历史数据清除完成');

    } catch (error) {
        console.error('清除历史数据失败:', error);
        showError('清除历史数据失败: ' + error.message);
    }
}

function updateFaceDetectionIndicator(detected) {
    if (elements.faceDetectionStatus) {
        if (detected) {
            elements.faceDetectionStatus.innerHTML = '<i class="fas fa-check-circle"></i><span>面部已检测</span>';
            elements.faceDetectionStatus.style.color = '#00ff00';
        } else {
            elements.faceDetectionStatus.innerHTML = '<i class="fas fa-search"></i><span>搜索面部中...</span>';
            elements.faceDetectionStatus.style.color = '#00ffff';
        }
    }
    
    // 注意：心率显示现在由增强PPG检测器自动处理，不需要在这里手动重置
    console.log('人脸检测状态更新:', detected ? '检测到' : '未检测到');
}

function updateAnalysisCount() {
    analysisCount++;
    if (elements.analysisCount) {
        elements.analysisCount.textContent = analysisCount;
    }
}

// 检测记录功能
function openDetectionRecords() {
    window.location.href = '/records';
}

// 保存检测记录
async function saveCurrentRecord() {
    if (!currentSessionId) {
        showError('没有活跃的会话可以保存');
        return;
    }

    try {
        // 先停止检测
        await stopDetectionCore();
        
        // 显示保存确认弹窗
        const shouldSave = await showSaveConfirmDialog();
        
        if (!shouldSave) {
            console.log('用户选择不保存数据');
            showNotification('数据未保存', 'info');
            await endCurrentSession(); // 仍然结束会话
            return;
        }

        // 结束当前会话以确保有结束时间
        await endCurrentSession();

        showNotification('正在保存检测记录...', 'info');
        elements.saveRecordBtn.disabled = true;

        const response = await fetch('/api/save_record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('检测记录保存成功！', 'success');
            // 保存成功后重置会话
            currentSessionId = null;
            resetAnalysisTimer();
            resetHeartRateDisplay();
        } else {
            showError('保存记录失败: ' + result.message);
        }

    } catch (error) {
        console.error('保存记录失败:', error);
        showError('保存记录失败: ' + error.message);
    } finally {
        elements.saveRecordBtn.disabled = false;
    }
}


// 显示保存确认弹窗
function showSaveConfirmDialog() {
    return new Promise((resolve) => {
        // 创建弹窗元素
        const modal = document.createElement('div');
        modal.className = 'save-confirm-modal';
        modal.innerHTML = `
            <div class="save-confirm-content">
                <div class="save-confirm-header">
                    <h3>保存分析数据</h3>
                </div>
                <div class="save-confirm-body">
                    <p>检测已完成，是否要保存本次分析数据？</p>
                    <p class="save-hint">数据将保存为JSON文件到database目录</p>
                </div>
                <div class="save-confirm-footer">
                    <button class="btn-cancel">不保存</button>
                    <button class="btn-confirm">保存数据</button>
                </div>
            </div>
        `;
        
        // 添加样式
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;
        
        const content = modal.querySelector('.save-confirm-content');
        content.style.cssText = `
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 10px;
            padding: 30px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        `;
        
        const header = modal.querySelector('.save-confirm-header h3');
        header.style.cssText = `
            color: #00ffff;
            margin-bottom: 20px;
            font-size: 20px;
        `;
        
        const body = modal.querySelector('.save-confirm-body');
        body.style.cssText = `
            margin-bottom: 30px;
        `;
        
        const hint = modal.querySelector('.save-hint');
        hint.style.cssText = `
            color: #888;
            font-size: 14px;
            margin-top: 10px;
        `;
        
        const footer = modal.querySelector('.save-confirm-footer');
        footer.style.cssText = `
            display: flex;
            gap: 15px;
            justify-content: center;
        `;
        
        const buttons = modal.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.style.cssText = `
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.3s ease;
            `;
        });
        
        const cancelBtn = modal.querySelector('.btn-cancel');
        cancelBtn.style.cssText += `
            background: #666;
            color: white;
        `;
        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.background = '#555';
        });
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.background = '#666';
        });
        
        const confirmBtn = modal.querySelector('.btn-confirm');
        confirmBtn.style.cssText += `
            background: #00ffff;
            color: #000;
        `;
        confirmBtn.addEventListener('mouseenter', () => {
            confirmBtn.style.background = '#00dddd';
        });
        confirmBtn.addEventListener('mouseleave', () => {
            confirmBtn.style.background = '#00ffff';
        });
        
        // 事件处理
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });
        
        confirmBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });
        
        // ESC键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEsc);
                if (document.body.contains(modal)) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // 添加到页面
        document.body.appendChild(modal);
        
        // 聚焦确认按钮
        setTimeout(() => {
            confirmBtn.focus();
        }, 100);
    });
}

// 带用户确认的保存记录到database目录
async function confirmAndSaveRecord() {
    if (!currentSessionId) {
        console.log('没有活跃的会话，跳过保存');
        return;
    }

    try {
        // 显示保存确认弹窗
        const shouldSave = await showSaveConfirmDialog();
        
        if (!shouldSave) {
            console.log('用户选择不保存数据');
            showNotification('数据未保存', 'info');
            await endCurrentSession(); // 仍然结束会话
            return;
        }

        console.log('用户确认保存，开始保存记录到database目录...');

        // 先结束会话
        await endCurrentSession();

        // 保存到database目录
        const response = await fetch('/api/save_record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('检测记录已保存到database目录！', 'success');
            resetAnalysisTimer();
            resetHeartRateDisplay();
        } else {
            console.error('保存记录失败');
            showNotification('保存记录失败', 'error');
        }
    } catch (error) {
        console.error('保存记录失败:', error);
        showNotification('保存记录失败: ' + error.message, 'error');
    }
}

// 结束当前会话
async function endCurrentSession() {
    if (!currentSessionId) {
        return;
    }

    try {
        const response = await fetch('/api/end_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId
            })
        });

        const result = await response.json();
        if (result.success) {
            console.log('会话已结束');
        }
    } catch (error) {
        console.error('结束会话失败:', error);
    }
}

// 更新分析状态显示
function updateAnalysisStatus(message) {
    if (elements.faceDetectionStatus) {
        const span = elements.faceDetectionStatus.querySelector('span');
        if (span) {
            span.textContent = message;
        }
    }
}

// 显示上传状态
function showUploadStatus(message) {
    if (elements.uploadStatus) {
        const statusText = elements.uploadStatus.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = message;
        }
        elements.uploadStatus.style.display = 'flex';
        
        // 隐藏上传区域的原始内容，避免字体拥挤
        const uploadContent = elements.uploadArea.querySelector('.upload-content');
        if (uploadContent) {
            uploadContent.style.display = 'none';
        }
    }
}

// 隐藏上传状态
function hideUploadStatus() {
    if (elements.uploadStatus) {
        elements.uploadStatus.style.display = 'none';
        
        // 恢复上传区域的原始内容显示
        const uploadContent = elements.uploadArea.querySelector('.upload-content');
        if (uploadContent) {
            uploadContent.style.display = 'flex';
        }
    }
}

// 文件上传处理
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        processUploadedFile(file);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    elements.uploadArea.classList.add('dragover');
}

function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    elements.uploadArea.classList.remove('dragover');

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processUploadedFile(files[0]);
    }
}

async function processUploadedFile(file) {
    console.log('处理上传文件:', file.name);

    // 重置标志
    window.videoDataSaved = false;
    window.videoAnalysisCompleted = false;
    window.videoPlaybackEnded = false;
    
    // 确保WebSocket连接
    if (!socket || !socket.connected) {
        console.log('初始化WebSocket连接...');
        connectWebSocket();
        
        // 等待连接完成
        await new Promise((resolve) => {
            let attempts = 0;
            const checkConnection = setInterval(() => {
                attempts++;
                if (socket && socket.connected) {
                    clearInterval(checkConnection);
                    console.log('WebSocket连接就绪');
                    resolve();
                } else if (attempts > 50) {  // 超过50次尝试（5秒）
                    clearInterval(checkConnection);
                    console.warn('WebSocket连接超时，但继续处理');
                    resolve();
                }
            }, 100);
        });
    }

    // 检查文件类型
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (!isVideo && !isAudio) {
        showError('请上传视频或音频文件');
        return;
    }

    if (isVideo) {
        try {
            // 显示上传状态
            showUploadStatus('正在上传视频文件...');

            // 上传视频文件到服务器
            const formData = new FormData();
            formData.append('video', file);

            const response = await fetch('/api/upload_video', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // 设置视频源并自动播放
                const fileURL = URL.createObjectURL(file);
                elements.videoPreview.src = fileURL;
                elements.videoPreview.style.display = 'block';
                elements.videoPreview.muted = true; // 静音以允许自动播放

                // 存储会话信息
                currentSessionId = result.session_id;
                uploadedVideoInfo = result.video_info;
                isVideoAnalyzing = true;

                // 清除可能存在的旧事件监听器
                elements.videoPreview.onloadeddata = null;
                elements.videoPreview.onplay = null;
                elements.videoPreview.onended = null;
                
                // 确保视频元素可见（音频文件可能隐藏了它）
                elements.videoPreview.style.display = 'block';
                
                // 等待视频加载完成后自动播放并开始分析
                elements.videoPreview.onloadeddata = async function() {
                    showUploadStatus('视频已加载，准备开始分析...');
                    
                    // 先启动分析，确保WebSocket准备好
                    const analysisStarted = await startUploadedVideoAnalysis();
                    
                    if (!analysisStarted) {
                        console.error('分析启动失败');
                        hideUploadStatus();
                        showError('无法启动视频分析，请刷新页面后重试');
                        return;
                    }

                    // 然后尝试播放视频
                    try {
                        await elements.videoPreview.play();
                        hideUploadStatus();
                        showNotification('视频开始播放，正在进行情绪分析...（已静音）', 'success');

                        // 添加播放控制按钮
                        addVideoPlaybackControls();

                    } catch (playError) {
                        console.warn('自动播放失败，用户需要手动播放:', playError);
                        hideUploadStatus();
                        showNotification('视频已加载，请点击播放按钮开始分析', 'info');

                        // 重置状态标志
                        window.videoAnalysisCompleted = false;
                        window.videoPlaybackEnded = false;
                        window.videoDataSaved = false;
                    }
                };

                // 视频播放结束时的处理
                elements.videoPreview.onended = function() {
                    console.log('视频播放结束');
                    window.videoPlaybackEnded = true;
                    
                    // 如果分析已完成，询问保存
                    if (window.videoAnalysisCompleted) {
                        stopAnalysisTimer();
                        isVideoAnalyzing = false;
                        
                        setTimeout(() => {
                            if (currentSessionId && !window.videoDataSaved) {
                                window.videoDataSaved = true;
                                confirmAndSaveRecord();
                            }
                        }, 1000);
                    } else {
                        // 分析未完成，继续等待
                        console.log('等待分析完成...');
                    }
                };

            } else {
                hideUploadStatus();
                showError('视频上传失败: ' + result.message);
            }

        } catch (error) {
            hideUploadStatus();
            console.error('视频上传失败:', error);
            showError('视频上传失败: ' + error.message);
        }
    } else if (isAudio) {
        // 处理音频文件
        await processAudioFile(file);
    }
}

// 处理音频文件上传
async function processAudioFile(file) {
    try {
        console.log('处理音频文件:', file.name);
        
        // 显示上传状态
        showUploadStatus('正在准备音频文件...');
        
        // 创建一个虚拟视频文件（只含音频）
        // 因为后端使用视频处理器处理所有多媒体文件
        const formData = new FormData();
        formData.append('video', file, file.name);
        
        const response = await fetch('/api/upload_video', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 设置音频源
            const fileURL = URL.createObjectURL(file);
            
            // 创建隐藏的audio元素用于播放，不显示控制条
            const audioElement = new Audio(fileURL);
            audioElement.style.display = 'none';
            
            // 不显示视频预览区的播放器
            elements.videoPreview.style.display = 'none';
            
            // 存储会话信息
            currentSessionId = result.session_id;
            uploadedVideoInfo = result.video_info;
            isVideoAnalyzing = true;
            
            // 重置状态标志
            window.videoAnalysisCompleted = false;
            window.videoPlaybackEnded = false;
            window.videoDataSaved = false;
            
            // 先启动分析
            showUploadStatus('正在启动音频分析...');
            const analysisStarted = await startUploadedVideoAnalysis();
            
            if (!analysisStarted) {
                hideUploadStatus();
                showError('无法启动音频分析');
                return;
            }
            
            hideUploadStatus();
            showNotification('音频正在分析中...', 'success');
            
            // 启动音频可视化
            startAudioFileVisualization(audioElement);
            
            // 自动播放音频
            try {
                await audioElement.play();
                console.log('音频已开始自动播放');
            } catch (playError) {
                console.warn('音频自动播放失败:', playError);
                showNotification('请点击页面任意位置开始音频分析', 'info');
                
                // 添加点击事件以启动播放
                document.addEventListener('click', async function playOnClick() {
                    await audioElement.play();
                    document.removeEventListener('click', playOnClick);
                }, { once: true });
            };
            
            // 音频播放结束时的处理
            audioElement.onended = function() {
                console.log('音频播放结束');
                window.videoPlaybackEnded = true;
                
                // 停止音频可视化
                stopAudioFileVisualization();
                
                if (window.videoAnalysisCompleted) {
                    stopAnalysisTimer();
                    isVideoAnalyzing = false;
                    
                    setTimeout(() => {
                        if (currentSessionId && !window.videoDataSaved) {
                            window.videoDataSaved = true;
                            confirmAndSaveRecord();
                        }
                    }, 1000);
                } else {
                    // 等待分析完成
                    console.log('等待分析完成...');
                }
            };
            
            // 保存音频元素引用以便后续使用
            window.currentAudioElement = audioElement;
            
        } else {
            hideUploadStatus();
            showError('音频上传失败: ' + result.message);
        }
        
    } catch (error) {
        hideUploadStatus();
        console.error('音频处理失败:', error);
        showError('音频处理失败: ' + error.message);
    }
}

// 启动上传视频分析
async function startUploadedVideoAnalysis() {
    try {
        console.log('开始上传视频分析，会话ID:', currentSessionId);

        if (!currentSessionId) {
            console.error('没有有效的会话ID');
            return false;
        }

        // 确保WebSocket已连接
        if (!socket || !socket.connected) {
            console.warn('WebSocket未连接，重新连接...');
            // 重新初始化WebSocket连接
            connectWebSocket();
            
            // 等待连接完成
            await new Promise((resolve) => {
                let attempts = 0;
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (socket && socket.connected) {
                        clearInterval(checkInterval);
                        console.log('WebSocket连接已就绪');
                        resolve();
                    } else if (attempts > 50) {  // 5秒超时
                        clearInterval(checkInterval);
                        console.log('WebSocket连接超时，但继续处理');
                        resolve();
                    }
                }, 100);
            });
        }

        // 确保模型已加载
        const modelStatus = await checkModelsReady();
        if (!modelStatus.ready) {
            console.warn('模型尚未加载完成，等待加载...');
            showNotification('正在加载AI模型，请稍候...', 'info');
            // 等待模型加载
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // 调用服务器开始视频分析
        const response = await fetch('/api/start_video_analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSessionId
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('视频分析已启动');

            // 更新UI状态
            elements.saveRecordBtn.disabled = false;

            // 开始计时
            startAnalysisTimer();

            // 只有视频文件才启动帧分析
            if (uploadedVideoInfo && !uploadedVideoInfo.is_audio_only) {
                startUploadedVideoFrameAnalysis();
            } else {
                console.log('音频文件，跳过帧分析');
            }

            // 监听分析完成事件 - 移除once限制，允许多次监听
            if (socket) {
                // 先移除旧的监听器，避免重复
                socket.off('video_analysis_complete');
                socket.on('video_analysis_complete', handleVideoAnalysisComplete);

                socket.off('video_analysis_progress');
                socket.on('video_analysis_progress', function(data) {
                    console.log('分析进度:', data);
                    if (data.message) {
                        updateAnalysisStatus(data.message);
                    }
                });
            }

            return true;  // 返回true表示成功启动
        } else {
            console.error('启动视频分析失败:', result.message);
            return false;  // 返回false表示启动失败
        }

    } catch (error) {
        console.error('启动视频分析失败:', error);
        showError('启动视频分析失败: ' + error.message);
        isVideoAnalyzing = false;
        return false;  // 返回false表示启动失败
    }
}

// 上传视频帧分析功能
function startUploadedVideoFrameAnalysis() {
    console.log('开始上传视频的实时帧分析');
    
    const video = elements.videoPreview;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // 设置canvas尺寸
    canvas.width = 640;
    canvas.height = 480;
    
    let frameAnalysisInterval;
    
    function captureUploadedVideoFrame() {
        if (!isVideoAnalyzing || video.paused || video.ended) {
            console.log('停止上传视频帧分析');
            if (frameAnalysisInterval) {
                clearInterval(frameAnalysisInterval);
            }
            return;
        }
        
        try {
            // 绘制视频帧到canvas
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // 获取图像数据并发送到服务器
            canvas.toBlob(function(blob) {
                if (blob && socket && currentSessionId) {
                    const reader = new FileReader();
                    reader.onload = function() {
                        socket.emit('video_frame', {
                            session_id: currentSessionId,
                            frame_data: reader.result
                        });
                    };
                    reader.readAsDataURL(blob);
                }
            }, 'image/jpeg', 0.8);
            
        } catch (error) {
            console.error('上传视频帧捕获失败:', error);
        }
    }
    
    // 每1秒分析一次
    frameAnalysisInterval = setInterval(captureUploadedVideoFrame, 1000);
    
    // 视频结束时停止分析
    video.addEventListener('ended', function() {
        console.log('视频播放结束，停止帧分析');
        if (frameAnalysisInterval) {
            clearInterval(frameAnalysisInterval);
        }
        isVideoAnalyzing = false;
    }, { once: true });
}

// 摄像头麦克风控制
async function startCameraMic() {
    try {
        console.log('开始启动摄像头和麦克风...');

        // 检查是否在监控模式
        if (currentMode === 'monitor') {
            showError('当前处于学生监控模式，请切换到本地检测模式');
            return;
        }

        // 检查模型是否已加载
        const modelStatus = await checkModelsReady();
        if (!modelStatus.ready) {
            showError('AI模型尚未加载完成，请稍候再试');
            return;
        }

        // 检查浏览器支持
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('您的浏览器不支持音视频采集功能');
        }

        // 检查HTTPS环境 - 更宽松的局域网检查
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const isLAN = location.hostname.startsWith('192.168.') || 
                     location.hostname.startsWith('10.') || 
                     location.hostname.startsWith('172.16.') ||
                     location.hostname.startsWith('172.17.') ||
                     location.hostname.startsWith('172.18.') ||
                     location.hostname.startsWith('172.19.') ||
                     location.hostname.startsWith('172.2') ||
                     location.hostname.startsWith('172.3') ||
                     /^192\.168\.\d+\.\d+$/.test(location.hostname) ||
                     /^10\.\d+\.\d+\.\d+$/.test(location.hostname);
        
        const isSecure = location.protocol === 'https:';
        
        console.log('环境检查:', {
            hostname: location.hostname,
            protocol: location.protocol,
            isLocalhost,
            isLAN,
            isSecure
        });
        
        if (!isSecure && !isLocalhost && !isLAN) {
            throw new Error('由于安全限制，音视频功能需要在HTTPS环境或局域网环境下运行');
        }

        // 同时获取摄像头和麦克风权限
        console.log('请求摄像头和麦克风权限...');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: {
                    sampleRate: 44100,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            console.log('✅ 媒体流获取成功');
            console.log('视频轨道数量:', stream.getVideoTracks().length);
            console.log('音频轨道数量:', stream.getAudioTracks().length);

            // 检查音频轨道状态
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                console.log('音频轨道状态:', audioTracks[0].readyState);
                console.log('音频轨道设置:', audioTracks[0].getSettings());
            }

            // 设置媒体流
            mediaStream = stream;
            elements.videoPreview.srcObject = stream;
            elements.videoPreview.style.display = 'block';
            
        } catch (mediaError) {
            console.error('媒体流获取失败:', mediaError);
            
            // 提供更详细的错误信息
            let errorMessage = '无法启动摄像头和麦克风: ';
            if (mediaError.name === 'NotAllowedError') {
                errorMessage += '用户拒绝了权限请求，请刷新页面并允许访问';
            } else if (mediaError.name === 'NotFoundError') {
                errorMessage += '未找到摄像头或麦克风设备';
            } else if (mediaError.name === 'NotSupportedError') {
                errorMessage += '浏览器不支持请求的媒体类型';
            } else if (mediaError.name === 'NotReadableError') {
                errorMessage += '硬件设备被占用或无法访问';
            } else {
                errorMessage += mediaError.message;
            }
            
            throw new Error(errorMessage);
        }

        // 创建新会话
        console.log('创建新会话...');
        const response = await fetch('/api/start_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('会话创建响应:', result);

        if (!result.success) {
            throw new Error(result.message || '会话创建失败');
        }

        currentSessionId = result.session_id;
        console.log('会话ID:', currentSessionId);

        // 确保Socket连接和视频都准备就绪后再开始分析
        let analysisStartAttempts = 0;
        const maxAnalysisStartAttempts = 15; // 最多等待30秒 (15 * 2秒)
        
        function startAnalysisWhenReady() {
            analysisStartAttempts++;
            console.log(`尝试启动分析 (${analysisStartAttempts}/${maxAnalysisStartAttempts})`);
            
            const socketReady = socket && socket.connected;
            const videoReady = elements.videoPreview.videoWidth > 0;
            const sessionReady = currentSessionId !== null;
            
            console.log(`Socket准备: ${socketReady}, 视频准备: ${videoReady}, 会话准备: ${sessionReady}`);
            
            if (socketReady && sessionReady) {
                console.log('必要条件已满足，开始启动分析功能');
                
                // 开始录制和分析
                startMediaRecording();
                startVideoAnalysis();
                startAudioVisualization();

                // 初始化心率检测显示
                initializeHeartRateDisplay();

                console.log('所有分析功能已启动');

                // 显示成功通知并更新状态
                updateSystemStatus('cameraStatus', '已启动');
                updateSystemStatus('microphoneStatus', '已启动');
                showNotification('情绪分析已开始，正在初始化AI模型...', 'success');
                
                return; // 成功启动，退出重试循环
            }
            
            // 检查是否超过最大尝试次数
            if (analysisStartAttempts >= maxAnalysisStartAttempts) {
                console.error('超过最大尝试次数，启动分析失败');
                showError('初始化超时，请刷新页面后重试');
                return;
            }
            
            // 继续等待
            console.log('等待所有组件准备就绪...');
            setTimeout(startAnalysisWhenReady, 2000);
        }
        
        // 延迟1秒启动，确保所有初始化完成
        setTimeout(startAnalysisWhenReady, 1000);

        // 开始计时
        startAnalysisTimer();

        // 更新UI状态
        isRecording = true;
        elements.startCameraMic.disabled = true;
        elements.stopDetection.disabled = false;
        elements.saveRecordBtn.disabled = false;

        updateSystemStatus('cameraStatus', '初始化中...');
        updateSystemStatus('microphoneStatus', '初始化中...');
        showNotification('摄像头和麦克风已启动，正在初始化系统...', 'info');

        console.log('摄像头麦克风启动成功，会话ID:', currentSessionId);

    } catch (error) {
        console.error('启动摄像头麦克风失败:', error);
        
        // 检查是否是权限问题，如果在局域网环境下提供解决方案
        const currentHost = location.hostname;
        const isLAN = /^192\.168\.\d+\.\d+$/.test(currentHost) || 
                     /^10\.\d+\.\d+\.\d+$/.test(currentHost) ||
                     currentHost.startsWith('172.');
        
        let errorMessage = '启动失败: ' + error.message;
        if (isLAN && (error.name === 'NotAllowedError' || error.message.includes('Permission denied'))) {
            errorMessage = '启动失败: 您的浏览器不支持音视频采集功能。在局域网环境下，请点击"本地检测"按钮切换到本地模式以启用音视频功能。';
        }
        
        showError(errorMessage);

        // 重置状态
        isRecording = false;
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        elements.startCameraMic.disabled = false;
        elements.stopDetection.disabled = true;
        elements.saveRecordBtn.disabled = true;
    }
}

// 停止检测的核心逻辑（不包括确认弹窗）
async function stopDetectionCore() {
    try {
        console.log('停止情绪检测...');

        // 停止媒体录制
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }

        // 停止媒体流
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }

        // 清理音频上下文
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
            audioContext = null;
            analyser = null;
        }

        // 移除音频状态指示器
        const audioStatusIndicator = document.getElementById('audio-status-indicator');
        if (audioStatusIndicator) {
            audioStatusIndicator.remove();
        }

        // 重置音频级别显示
        const audioLevelElement = document.getElementById('audio-level');
        if (audioLevelElement) {
            audioLevelElement.style.setProperty('--audio-level', '0%');
            const peakIndicator = audioLevelElement.querySelector('.peak-indicator');
            if (peakIndicator) {
                peakIndicator.remove();
            }
        }

        // 清空音频canvas
        const audioCanvas = elements.audioCanvas;
        if (audioCanvas) {
            const context = audioCanvas.getContext('2d');
            context.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
            context.fillStyle = '#1a1a1a';
            context.fillRect(0, 0, audioCanvas.width, audioCanvas.height);
        }

        // 隐藏视频预览
        elements.videoPreview.style.display = 'none';
        elements.videoPreview.srcObject = null;

        // 停止计时器
        stopAnalysisTimer();

        // 重置心率检测显示
        resetHeartRateDisplay();

        // 重置状态
        isRecording = false;

        // 更新UI
        elements.startCameraMic.disabled = false;
        elements.stopDetection.disabled = true;
        elements.saveRecordBtn.disabled = true;

        updateSystemStatus('cameraStatus', '未启动');
        updateSystemStatus('microphoneStatus', '未启动');

        // 重置检测状态显示
        if (elements.faceDetectionStatus) {
            elements.faceDetectionStatus.innerHTML = '<i class="fas fa-search"></i><span>等待开始分析...</span>';
        }

        // 隐藏心率检测显示
        hideHeartRateDisplay();

        // 重置系统状态显示
        if (elements.sessionId) {
            elements.sessionId.textContent = '-';
        }
        if (elements.analysisCount) {
            elements.analysisCount.textContent = '0';
        }
        if (elements.sessionDuration) {
            elements.sessionDuration.textContent = '00:00';
        }

        showNotification('检测已停止', 'info');
        console.log('检测已停止');

    } catch (error) {
        console.error('停止检测失败:', error);
        showError('停止检测失败: ' + error.message);
        throw error; // 重新抛出错误，让调用者处理
    }
}

// 音频文件可视化
let audioFileVisualizationInterval = null;
let audioFileAnalyser = null;
let audioFileContext = null;

function startAudioFileVisualization(audioElement) {
    try {
        console.log('启动音频文件可视化');
        
        // 创建音频上下文
        audioFileContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 创建音频源
        const source = audioFileContext.createMediaElementSource(audioElement);
        
        // 创建分析器 - 使用与麦克风相同的参数
        audioFileAnalyser = audioFileContext.createAnalyser();
        audioFileAnalyser.fftSize = 256;
        audioFileAnalyser.smoothingTimeConstant = 0.8; // 平滑参数
        
        // 连接节点
        source.connect(audioFileAnalyser);
        audioFileAnalyser.connect(audioFileContext.destination);
        
        // 获取canvas元素
        const canvas = elements.audioCanvas;
        if (!canvas) {
            console.error('找不到音频canvas元素');
            return;
        }
        
        const context = canvas.getContext('2d');
        const bufferLength = audioFileAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // 设置canvas尺寸
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        // 显示音频状态指示器
        const audioStatusIndicator = document.getElementById('audio-status-indicator');
        if (audioStatusIndicator) {
            audioStatusIndicator.style.background = '#00ff00';
            audioStatusIndicator.style.boxShadow = '0 0 12px rgba(0, 255, 0, 0.8)';
        }
        
        // 绘制函数
        function draw() {
            if (!audioFileAnalyser) return;
            
            audioFileAnalyser.getByteFrequencyData(dataArray);
            
            // 清除画布
            context.fillStyle = '#1a1a1a';
            context.fillRect(0, 0, canvas.width, canvas.height);
            
            // 计算平均音量
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const audioLevel = (average / 255) * 100;
            
            // 更新音频级别显示
            const audioLevelElement = document.getElementById('audio-level');
            if (audioLevelElement) {
                audioLevelElement.style.setProperty('--audio-level', audioLevel + '%');
            }
            
            // 绘制频谱 - 使用与麦克风相同的参数
            const barWidth = canvas.width / bufferLength;
            const minBarHeight = 2; // 最小条高度，确保有基线
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                // 应用非线性缩放以获得更好的视觉效果（与麦克风一致）
                const normalizedValue = dataArray[i] / 255;
                const scaledValue = Math.pow(normalizedValue, 0.6); // 压缩动态范围
                const barHeight = Math.max(scaledValue * canvas.height * 0.85, minBarHeight);
                
                // 根据频率创建不同的颜色（与麦克风一致）
                const hue = (i / bufferLength) * 240; // 从蓝色到红色
                const saturation = 80 + (scaledValue * 20); // 动态饱和度
                const lightness = 40 + (scaledValue * 40); // 动态亮度
                
                // 创建动态渐变色
                const gradient = context.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
                gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`);
                gradient.addColorStop(0.6, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
                gradient.addColorStop(1, `hsl(${hue}, ${saturation - 20}%, ${lightness - 10}%)`);
                
                context.fillStyle = gradient;
                context.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
                
                x += barWidth;
            }
            
            // 添加发光效果（与麦克风一致）
            context.shadowColor = audioLevel > 15 ? '#00ff00' : audioLevel > 5 ? '#ffff00' : '#00ffff';
            context.shadowBlur = 6 + (audioLevel / 100) * 8; // 动态模糊
            context.globalCompositeOperation = 'lighter';
            
            // 第二遍：发光效果
            x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const normalizedValue = dataArray[i] / 255;
                const scaledValue = Math.pow(normalizedValue, 0.6);
                const barHeight = Math.max(scaledValue * canvas.height * 0.85, minBarHeight);
                
                const intensity = scaledValue * 0.4;
                context.fillStyle = `rgba(0, 255, 255, ${intensity})`;
                context.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
                x += barWidth;
            }
            
            // 重置合成模式
            context.globalCompositeOperation = 'source-over';
            context.shadowBlur = 0;
        }
        
        // 启动可视化循环
        audioFileVisualizationInterval = setInterval(draw, 50);
        
        console.log('音频文件可视化已启动');
        
    } catch (error) {
        console.error('音频文件可视化失败:', error);
    }
}

function stopAudioFileVisualization() {
    try {
        console.log('停止音频文件可视化');
        
        // 停止可视化循环
        if (audioFileVisualizationInterval) {
            clearInterval(audioFileVisualizationInterval);
            audioFileVisualizationInterval = null;
        }
        
        // 关闭音频上下文
        if (audioFileContext) {
            audioFileContext.close();
            audioFileContext = null;
        }
        
        audioFileAnalyser = null;
        
        // 清除canvas
        const canvas = elements.audioCanvas;
        if (canvas) {
            const context = canvas.getContext('2d');
            context.fillStyle = '#1a1a1a';
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        // 重置音频状态指示器
        const audioStatusIndicator = document.getElementById('audio-status-indicator');
        if (audioStatusIndicator) {
            audioStatusIndicator.style.background = '#ff0000';
            audioStatusIndicator.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.6)';
        }
        
        // 重置音频级别
        const audioLevelElement = document.getElementById('audio-level');
        if (audioLevelElement) {
            audioLevelElement.style.setProperty('--audio-level', '0%');
        }
        
        console.log('音频文件可视化已停止');
        
    } catch (error) {
        console.error('停止音频文件可视化失败:', error);
    }
}

// 停止检测按钮的处理函数
async function stopDetection() {
    try {
        // 先停止检测
        await stopDetectionCore();

        // 询问用户是否保存数据并结束会话
        if (currentSessionId) {
            await confirmAndSaveRecord();
        }

        // 重置会话ID
        currentSessionId = null;

    } catch (error) {
        console.error('停止检测失败:', error);
        showError('停止检测失败: ' + error.message);
    }
}



// 系统状态更新
function updateSystemStatus(statusType, value) {
    if (elements[statusType]) {
        elements[statusType].textContent = value;
    }
}

// 添加视频播放控制功能
function addVideoPlaybackControls() {
    const videoContainer = document.querySelector('.upload-section');
    
    // 检查是否已经添加过控制栏
    if (videoContainer.querySelector('.video-controls')) {
        return;
    }
    
    // 创建控制栏
    const controlBar = document.createElement('div');
    controlBar.className = 'video-controls';
    controlBar.style.cssText = `
        position: relative;
        margin-top: 10px;
        background: rgba(0, 0, 0, 0.7);
        padding: 10px;
        border-radius: 5px;
        display: flex;
        gap: 10px;
        align-items: center;
        z-index: 1000;
    `;
    
    // 播放/暂停按钮
    const playButton = document.createElement('button');
    playButton.innerHTML = '<i class="fas fa-pause"></i>';
    playButton.className = 'btn-secondary';
    playButton.style.cssText = 'padding: 5px 10px; font-size: 14px;';
    playButton.onclick = toggleVideoPlayback;
    
    // 音频开关按钮
    const muteButton = document.createElement('button');
    muteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
    muteButton.className = 'btn-secondary';
    muteButton.style.cssText = 'padding: 5px 10px; font-size: 14px;';
    muteButton.onclick = toggleVideoMute;
    
    // 进度显示
    const timeDisplay = document.createElement('span');
    timeDisplay.style.cssText = 'color: white; font-size: 12px;';
    timeDisplay.textContent = '00:00 / 00:00';
    
    controlBar.appendChild(playButton);
    controlBar.appendChild(muteButton);
    controlBar.appendChild(timeDisplay);
    
    videoContainer.appendChild(controlBar);
    
    // 更新时间显示
    elements.videoPreview.addEventListener('timeupdate', updateVideoTimeDisplay);
}

function toggleVideoPlayback() {
    const video = elements.videoPreview;
    const button = document.querySelector('.video-controls .fa-pause, .video-controls .fa-play');
    
    if (video.paused) {
        video.play();
        button.className = 'fas fa-pause';
    } else {
        video.pause();
        button.className = 'fas fa-play';
    }
}

function toggleVideoMute() {
    const video = elements.videoPreview;
    const button = document.querySelector('.video-controls .fa-volume-mute, .video-controls .fa-volume-up');
    
    video.muted = !video.muted;
    button.className = video.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
}

function updateVideoTimeDisplay() {
    const video = elements.videoPreview;
    const timeDisplay = document.querySelector('.video-controls span');
    
    if (video.duration && timeDisplay) {
        const currentTime = formatTime(video.currentTime);
        const duration = formatTime(video.duration);
        timeDisplay.textContent = `${currentTime} / ${duration}`;
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 通知系统
function showNotification(message, type = 'info') {
    if (!elements.notificationContainer) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    elements.notificationContainer.appendChild(notification);

    // 3秒后自动移除
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// 更新情绪结果显示
function updateEmotionResults(data) {
    if (data.video_emotion) {
        updateVideoEmotionResult(data.video_emotion);
    }

    if (data.audio_emotion) {
        updateAudioEmotionResult(data.audio_emotion);
    }

    // 更新综合评估
    updateComprehensiveAssessment(data);
}

function updateVideoEmotionResult(emotion) {
    console.log('更新视频情绪结果:', emotion);
    
    if (elements.videoDominantEmotion) {
        const translatedEmotion = translateEmotion(emotion.dominant) || '--';
        elements.videoDominantEmotion.textContent = translatedEmotion;
        console.log('✅ 视频情绪已更新:', translatedEmotion);
    } else {
        console.error('❌ videoDominantEmotion 元素未找到');
    }
    
    // 监控模式下由 updateVideoEmotionDisplay/overlay 指示器控制检测状态，避免相互覆盖
    try {
        if (typeof currentMode !== 'undefined' && currentMode === 'local') {
            if (elements.videoDetectionStatus) {
                elements.videoDetectionStatus.textContent = '检测中';
                console.log('✅ 视频检测状态已更新');
            }
        }
    } catch {}
}

function updateAudioEmotionResult(emotion) {
    console.log('更新音频情绪结果:', emotion);
    
    if (elements.audioDominantEmotion) {
        let displayText = translateEmotion(emotion.dominant) || '--';

        // 删除所有质量标识符号，与面部情绪分析保持一致
        // 只显示纯粹的情绪结果
        elements.audioDominantEmotion.textContent = displayText;
        console.log('✅ 音频情绪已更新:', displayText);
    } else {
        console.error('❌ audioDominantEmotion 元素未找到');
    }

    if (elements.audioDetectionStatus) {
        let statusText = '检测中';
        if (emotion.quality === 'fake') {
            statusText = '⚠️ 使用虚假数据';
        } else if (emotion.quality === 'low') {
            statusText = '⚠️ 备用分析';
        } else if (emotion.quality === 'emergency') {
            statusText = '⚠️ 紧急备用';
        } else if (emotion.quality === 'high') {
            statusText = '检测中';  // 改为与面部情绪分析一致的"检测中"
        } else if (emotion.quality === 'medium') {
            statusText = '检测中';  // 改为与面部情绪分析一致的"检测中"
        }
        elements.audioDetectionStatus.textContent = statusText;
    }
}

function updateComprehensiveAssessment(data) {
    // 这里可以添加综合情绪评估的逻辑
    if (elements.overallEmotion) {
        const dominantEmotion = data.video_emotion?.dominant || data.audio_emotion?.dominant;
        if (dominantEmotion) {
            elements.overallEmotion.textContent = translateEmotion(dominantEmotion);
        } else {
            elements.overallEmotion.textContent = '分析中...';
        }
    }
    if (elements.emotionIntensity) {
        elements.emotionIntensity.textContent = '中等';
    }

    // 更新情绪图标 - 支持9类情绪
    if (elements.emotionIcon) {
        const emotions = {
            'angry': '😠',
            'disgusted': '🤢',
            'fearful': '😨',
            'happy': '😊',
            'neutral': '😐',
            'other': '🤔',
            'sad': '😢',
            'surprised': '😲',
            'unknown': '❓',
            // 兼容旧版本
            'surprise': '😲',
            'fear': '😨',
            'disgust': '🤢'
        };

        const dominantEmotion = data.video_emotion?.dominant || data.audio_emotion?.dominant;
        elements.emotionIcon.textContent = emotions[dominantEmotion] || '😐';
    }
}

// 处理音频分段情绪分析结果
function handleAudioEmotionSegmentResult(data) {
    console.log('收到音频分段情绪分析结果:', data);

    const result = data.result;

    // 显示分段进度
    if (result.segment_index !== undefined && result.total_segments !== undefined) {
        const progress = ((result.segment_index + 1) / result.total_segments * 100).toFixed(1);
        console.log(`分段进度: ${result.segment_index + 1}/${result.total_segments} (${progress}%)`);

        // 可以在这里添加进度条显示
        showNotification(
            `分段分析进度: ${result.segment_index + 1}/${result.total_segments} - ${translateEmotion(result.dominant_emotion)}`,
            'info',
            1000
        );
    }

    // 实时更新图表（可选）
    if (result.emotions) {
        updateAudioEmotionChart(result.emotions);
    }
}

// 加载遮罩控制
function showLoadingOverlay(message = 'AI模型加载中...') {
    if (elements.loadingOverlay) {
        const loadingText = elements.loadingOverlay.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
        elements.loadingOverlay.style.display = 'flex';
    }
}

function hideLoadingOverlay() {
    console.log('尝试隐藏加载遮罩...');
    console.log('loadingOverlay元素:', elements.loadingOverlay);

    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = 'none';
        console.log('✓ 加载遮罩已隐藏');
    } else {
        console.error('✗ 找不到加载遮罩元素');
        // 尝试直接通过ID查找
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            console.log('✓ 通过ID直接隐藏加载遮罩');
        } else {
            console.error('✗ 完全找不到加载遮罩元素');
        }
    }
}

// ==================== 学生监控功能 ====================

// 初始化学生监控功能
function initStudentMonitoring() {
    // 模式切换按钮事件
    document.getElementById('local-mode-btn').addEventListener('click', () => switchMode('local'));
    document.getElementById('monitor-mode-btn').addEventListener('click', () => switchMode('monitor'));
    
    // 刷新学生列表按钮
    const refreshBtn = document.getElementById('refreshStudents');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshStudentList);
    }
    
    // 断开学生连接按钮
    document.getElementById('disconnectStudent').addEventListener('click', disconnectCurrentStudent);
    
    // 移除了清空所有会话按钮的功能
    
    // 监听学生端WebSocket事件（保留分析结果与状态；移除旧的帧直推方案）
    if (socket) {
        socket.on('student_connected', handleStudentConnected);
        socket.on('student_detection_stopped', handleStudentDetectionStopped);
        // 旧方案：不再监听 base64 帧
        // socket.on('student_video_stream', handleStudentVideoStream);
        // socket.on('student_audio_stream', handleStudentAudioStream);
        socket.on('student_video_emotion_result', handleStudentVideoEmotionResult);
        socket.on('student_audio_emotion_result', handleStudentAudioEmotionResult);
        socket.on('student_heart_rate_result', handleStudentHeartRateResult);
    }
}

// 连接监控命名空间 Socket（用于房间订阅与定向事件）
function connectMonitorSocket() {
    if (monitorSocket && monitorSocket.connected) {
        console.log('[Monitor] 命名空间已连接');
        return;
    }
    try {
        if (typeof io === 'undefined') {
            console.warn('[Monitor] Socket.IO未加载，跳过监控命名空间连接');
            return;
        }
        // 在 Flask-SocketIO 使用 threading 模式下，服务端不支持原生 WebSocket，
        // 需要允许回退到 polling 以确保 /monitor 命名空间可用
        monitorSocket = io('/monitor', {
            transports: ['websocket', 'polling'],
            path: '/socket.io',
            withCredentials: false
        });
        monitorSocket.on('connect', () => {
            console.log('[Monitor] 连接成功, sid=', monitorSocket.id);
            try {
                // 将默认命名空间的 socket.id 注册给服务器，便于定向推送
                if (socket && socket.id) {
                    monitorSocket.emit('monitor/register_sids', { default_sid: socket.id });
                }
            } catch (e) { console.warn('上报默认SID失败:', e); }
        });
        monitorSocket.on('disconnect', () => {
            console.log('[Monitor] 连接断开');
        });
        monitorSocket.on('monitor/subscribed', (data) => {
            console.log('[Monitor] 已订阅房间:', data);
        });
        monitorSocket.on('monitor/registered', (data) => {
            console.log('[Monitor] 已注册SID对应关系:', data);
        });
        monitorSocket.on('monitor/error', (e) => {
            console.warn('[Monitor] 订阅错误:', e);
        });
        // 监听标准化学生事件
        monitorSocket.on('student.emotion', (data) => {
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.stream_name)) {
                    handleStudentVideoEmotionResult({
                        session_id: currentMonitoringStudent.session_id,
                        student_id: currentMonitoringStudent.student_id,
                        result: data.result
                    });
                }
            } catch (e) { console.warn('student.emotion handler error:', e); }
        });
        monitorSocket.on('student.heart_rate', (data) => {
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.stream_name)) {
                    handleStudentHeartRateResult({
                        session_id: currentMonitoringStudent.session_id,
                        student_id: currentMonitoringStudent.student_id,
                        result: data.result
                    });
                }
            } catch (e) { console.warn('student.heart_rate handler error:', e); }
        });
        
        // 【关键修复】在Monitor Socket中监听多种分析事件
        // 监听原始事件名
        monitorSocket.on('video_emotion_result', (data) => {
            console.log('🎯 [Monitor收到视频情绪分析] video_emotion_result:', data);
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    console.log(`🔍 [Monitor] 比对流名称: 接收=${data.stream_name}, 期望=${streamName}`);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过Monitor Socket更新视频分析结果');
                        updateVideoEmotionDisplay(data.result);
                    } else {
                        console.log('❌ [监控模式] 流名称不匹配，忽略事件');
                    }
                } else {
                    console.log('⚠️ [Monitor] 未处理video_emotion_result，条件不满足:', {
                        currentMode, 
                        hasStudent: !!currentMonitoringStudent,
                        hasStreamName: !!data.stream_name
                    });
                }
            } catch (e) { 
                console.warn('❌ Monitor video_emotion_result handler error:', e); 
            }
        });
        // 学生音频（房间定向），与 student.heart_rate 类似
        monitorSocket.on('student.audio', (data) => {
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.stream_name)) {
                    handleStudentAudioEmotionResult({
                        session_id: currentMonitoringStudent.session_id,
                        student_id: currentMonitoringStudent.student_id,
                        result: data.result
                    });
                }
            } catch (e) { console.warn('student.audio handler error:', e); }
        });

        // 监听音频情绪分析事件（RTSP音频 or 兜底转发后服务端回推）
        monitorSocket.on('audio_emotion_result', (data) => {
            console.log('🎯 [Monitor收到语音情绪分析] audio_emotion_result:', data);
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过Monitor Socket更新音频分析结果');
                        handleAudioEmotionResult({ result: data.result });
                    } else {
                        console.log('❌ [监控模式] 音频流名称不匹配，忽略事件');
                    }
                } else if (currentMode === 'monitor' && currentMonitoringStudent && !data.stream_name) {
                    // 某些兼容分支可能不带 stream_name，通过会话比对（不推荐）
                    console.log('⚠️ [Monitor] 无 stream_name 的音频事件，尝试直接更新');
                    handleAudioEmotionResult({ result: data.result });
                }
            } catch (e) {
                console.warn('❌ Monitor audio_emotion_result handler error:', e);
            }
        });

        // 监听备用事件名
        monitorSocket.on('rtsp_video_analysis', (data) => {
            console.log('🎯 [Monitor收到视频情绪分析] rtsp_video_analysis:', data);
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过Monitor Socket(备用)更新视频分析结果');
                        updateVideoEmotionDisplay(data.result);
                    }
                }
            } catch (e) { 
                console.warn('❌ Monitor rtsp_video_analysis handler error:', e); 
            }
        });
        
        monitorSocket.on('heart_rate_result', (data) => {
            console.log('💓 [Monitor收到心率检测结果] heart_rate_result:', data);
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    console.log(`🔍 [Monitor] 比对心率流名称: 接收=${data.stream_name}, 期望=${streamName}`);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过Monitor Socket更新心率结果');
                        updateHeartRateDisplay(data.result);
                    }
                }
            } catch (e) { 
                console.warn('❌ Monitor heart_rate_result handler error:', e); 
            }
        });
        
        // 监听备用心率事件名
        monitorSocket.on('rtsp_heart_rate_analysis', (data) => {
            console.log('💓 [Monitor收到心率检测结果] rtsp_heart_rate_analysis:', data);
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过Monitor Socket(备用)更新心率结果');
                        updateHeartRateDisplay(data.result);
                    }
                }
            } catch (e) { 
                console.warn('❌ Monitor rtsp_heart_rate_analysis handler error:', e); 
            }
        });
        try {
            if (monitorSocket && typeof monitorSocket.onAny === 'function') {
                // 不再过滤事件名，完整打印以便诊断
                monitorSocket.onAny((event, payload) => {
                    console.log('[MONITOR SOCKET ANY]', event, payload);
                });
            }
        } catch {}
    } catch (e) {
        console.warn('[Monitor] 命名空间连接失败:', e);
    }
}

function _matchesCurrentStudentSession(sessionIdOrStream) {
    if (!currentMonitoringStudent) return false;
    const sid = currentMonitoringStudent.session_id;
    const sname = currentMonitoringStudent.stream_name;
    return sessionIdOrStream === sid || (sname && sessionIdOrStream === sname);
}

// 切换工作模式
function switchMode(mode) {
    if (currentMode === mode) return;
    
    // 检查是否需要URL跳转
    const currentHost = location.hostname;
    const currentPort = location.port || '5000';
    let needRedirect = false;
    let targetURL = '';
    
    if (mode === 'local') {
        // 本地检测模式 - 跳转到localhost以启用音视频功能
        if (currentHost !== '127.0.0.1' && currentHost !== 'localhost') {
            needRedirect = true;
            targetURL = `http://127.0.0.1:${currentPort}${location.pathname}${location.search}`;
            showNotification('正在跳转到本地地址以启用音视频功能...', 'info');
        }
    } else if (mode === 'monitor') {
        // 学生监控模式 - 跳转到局域网IP
        if (currentHost === '127.0.0.1' || currentHost === 'localhost') {
            needRedirect = true;
            showNotification('正在跳转到局域网地址以启用学生监控功能...', 'info');
            // 从后端获取局域网IP
            fetch('/api/health')
                .then(response => response.json())
                .then(data => {
                    if (data.lan_ip && data.lan_ip !== '127.0.0.1') {
                        targetURL = `http://${data.lan_ip}:${currentPort}${location.pathname}${location.search}`;
                        // 添加模式参数确保跳转后直接进入监控模式
                        const urlParams = new URLSearchParams(location.search);
                        urlParams.set('mode', 'monitor');
                        targetURL = `http://${data.lan_ip}:${currentPort}${location.pathname}?${urlParams.toString()}`;
                        location.href = targetURL;
                    } else {
                        console.warn('无法获取局域网IP，继续使用当前地址');
                        switchModeInternal(mode);
                    }
                })
                .catch(error => {
                    console.error('获取局域网IP失败:', error);
                    showError('获取局域网IP失败，请手动访问局域网地址');
                    switchModeInternal(mode);
                });
            return; // 等待异步操作完成
        }
    }
    
    if (needRedirect && targetURL) {
        // 添加模式参数确保跳转后直接进入对应模式
        const urlParams = new URLSearchParams();
        urlParams.set('mode', mode);
        targetURL = targetURL.includes('?') 
            ? `${targetURL}&mode=${mode}` 
            : `${targetURL}?mode=${mode}`;
        
        console.log(`模式切换需要跳转: ${targetURL}`);
        location.href = targetURL;
        return;
    }
    
    // 如果不需要跳转，直接执行模式切换
    switchModeInternal(mode);
}

// 内部模式切换函数（不涉及URL跳转）
function switchModeInternal(mode) {
    if (currentMode === mode) return;
    
    // 停止当前活动
    if (isRecording) {
        stopDetection();
    }
    
    currentMode = mode;
    
    // 更新按钮状态
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${mode}-mode-btn`).classList.add('active');
    
    // 切换面板显示
    if (mode === 'local') {
        document.getElementById('local-control-panel').style.display = 'block';
        document.getElementById('monitor-control-panel').style.display = 'none';
        showNotification('已切换到本地检测模式', 'success');
    } else {
        document.getElementById('local-control-panel').style.display = 'none';
        document.getElementById('monitor-control-panel').style.display = 'block';
        showNotification('已切换到学生监控模式', 'success');
        refreshStudentList();
        startMonitoringTimer();
    }
    
    // 清空检测结果
    clearDetectionResults();
    
    // 重新初始化图表以确保颜色正确
    setTimeout(() => {
        try {
            console.log('重新初始化图表...');
            if (audioEmotionChart && typeof audioEmotionChart.destroy === 'function') {
                audioEmotionChart.destroy();
                audioEmotionChart = null;
            }
            if (videoEmotionChart && typeof videoEmotionChart.destroy === 'function') {
                videoEmotionChart.destroy();
                videoEmotionChart = null;
            }
            if (emotionTrendChart && typeof emotionTrendChart.destroy === 'function') {
                emotionTrendChart.destroy();
                emotionTrendChart = null;
            }
            initializeCharts();
        } catch (error) {
            console.error('重新初始化图表失败:', error);
        }
    }, 100);
}

// 刷新学生列表
async function refreshStudentList() {
    try {
        const response = await fetch('/api/student_sessions');
        const data = await response.json();
        
        if (data.success) {
            studentSessions = data.student_sessions;
            updateStudentList();
            updateStudentStats(data.total_students, data.active_students);
        } else {
            showNotification('获取学生列表失败', 'error');
        }
    } catch (error) {
        console.error('刷新学生列表失败:', error);
        showNotification('刷新学生列表失败', 'error');
    }
}

// 更新学生列表显示
function updateStudentList() {
    const studentList = document.getElementById('studentList');
    
    if (studentSessions.length === 0) {
        studentList.innerHTML = `
            <div class="no-students">
                <i class="fas fa-user-slash"></i>
                <p>暂无在线学生</p>
            </div>
        `;
        return;
    }
    
    const studentItems = studentSessions.map(student => {
        const isActive = student.session_id === currentMonitoringStudent?.session_id;
        const statusClass = student.status === 'active' ? 'online' : 'detecting';
        const statusText = student.status === 'active' ? '在线' : '检测中';
        
        return `
            <div class="student-item ${isActive ? 'active' : ''}" data-session-id="${student.session_id}">
                <div class="student-header">
                    <span class="student-id">${student.student_id || student.session_id.substring(0, 8)}</span>
                    <span class="student-status ${statusClass}">${statusText}</span>
                    <button class="student-remove-btn" title="断开连接" data-session-id="${student.session_id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="student-details">
                    <span>考试: ${student.exam_id || '未知'}</span>
                    <span>${formatTime(student.start_time)}</span>
                </div>
            </div>
        `;
    }).join('');
    
    studentList.innerHTML = studentItems;
    
    // 添加点击事件
    studentList.querySelectorAll('.student-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // 如果点击的是删除按钮，不触发选择学生事件
            if (e.target.closest('.student-remove-btn')) {
                return;
            }
            const sessionId = item.dataset.sessionId;
            selectStudent(sessionId);
        });
    });
    
    // 添加删除按钮事件
    studentList.querySelectorAll('.student-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            const student = studentSessions.find(s => s.session_id === sessionId);
            showRemoveStudentConfirm(sessionId, student?.student_id || sessionId.substring(0, 8));
        });
    });
}

// 选择要监控的学生
function selectStudent(sessionId) {
    console.log('[教师端] 选择监控学生:', sessionId?.substring(0, 8) + '...');
    
    const student = studentSessions.find(s => s.session_id === sessionId);
    if (!student) {
        console.log('[教师端] 未找到指定的学生会话');
        console.log('[调试] 教师端问题: 学生会话不存在或已过期');
        return;
    }
    
    console.log('[教师端] 找到学生信息:', {
        student_id: student.student_id,
        exam_id: student.exam_id,
        status: student.status,
        start_time: student.start_time
    });
    
    currentMonitoringStudent = student;
    console.log('[教师端] 已设置当前监控学生:', student.student_id || sessionId.substring(0, 8));
    console.log('[调试] 教师端正常: 学生监控目标已设置，准备接收该学生的数据流');
    
    updateStudentList(); // 更新选中状态
    updateCurrentStudentInfo();
    
    showNotification(`开始监控学生: ${student.student_id || sessionId.substring(0, 8)}`, 'success');
    
    // 清空之前的显示内容，准备显示新学生的数据
    clearDetectionResults();
    console.log('[教师端] 已清空之前的检测结果，准备显示新学生数据');
    // 停止可能存在的远端音频转发
    try { stopRemoteAudioForwarding(); } catch {}

    // RTSP 当前未提供语音情绪分析，给出清晰状态提示，避免用户误解
    try {
        if (elements.audioDominantEmotion) {
            elements.audioDominantEmotion.textContent = '--';
        }
        if (elements.audioDetectionStatus) {
            elements.audioDetectionStatus.textContent = 'RTSP音频未分析';
        }
        if (audioEmotionChart) {
            // 恢复为默认中性占比
            audioEmotionChart.data.datasets[0].data = [0,0,0,0,100,0,0,0,0];
            audioEmotionChart.update();
        }
    } catch (e) { /* 忽略UI占位失败 */ }

    // 启动 WHEP 播放与 AI RTSP 分析
    stopWhepPlayback()
      .finally(async () => {
        try {
          const streamName = student.stream_name || computeStreamName(student.exam_id, student.student_id);
          // 绑定 stream_name -> session_id，便于服务端发送 student_* 事件
          const bindResp = await fetch('/api/monitor/bind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stream_name: streamName,
              session_id: student.session_id,
              student_id: student.student_id,
              sid: (monitorSocket && monitorSocket.id) || null,
              sid_default: (socket && socket.id) || null
            })
          });
          let bindInfo = null;
          try { bindInfo = await bindResp.json(); } catch {}
          console.log('[监控] 绑定流与会话:', bindResp.status, bindInfo);
        } catch (e) {
          console.warn('绑定流与会话失败（不影响播放）:', e);
        }
        // 通过 Socket 订阅对应房间（双保险）
        try {
            if (monitorSocket && monitorSocket.connected) {
                const streamName = student.stream_name || computeStreamName(student.exam_id, student.student_id);
                monitorSocket.emit('monitor/subscribe', { stream_name: streamName });
            }
        } catch (e) { console.warn('订阅监控房间失败（不影响播放）:', e); }
        startWhepPlaybackForStudent(currentMonitoringStudent);
        try { startStatePollingForStudent(currentMonitoringStudent); } catch (e) { console.warn('启动状态轮询失败：', e); }
        try { startAudioStatusPolling(currentMonitoringStudent); } catch (e) { console.warn('启动音频状态轮询失败：', e); }
      });
}

// 更新当前监控学生信息
function updateCurrentStudentInfo() {
    const info = document.getElementById('currentStudentInfo');
    const disconnectBtn = document.getElementById('disconnectStudent');
    
    if (!currentMonitoringStudent) {
        document.getElementById('currentStudentId').textContent = '--';
        document.getElementById('currentExamId').textContent = '--';
        document.getElementById('connectionDuration').textContent = '--';
        disconnectBtn.disabled = true;
        return;
    }
    
    document.getElementById('currentStudentId').textContent = 
        currentMonitoringStudent.student_id || currentMonitoringStudent.session_id.substring(0, 8);
    document.getElementById('currentExamId').textContent = currentMonitoringStudent.exam_id || '--';
    
    // 计算连接时长
    const startTime = new Date(currentMonitoringStudent.start_time);
    const duration = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('connectionDuration').textContent = formatDuration(duration);
    
    disconnectBtn.disabled = false;
}

// 更新学生统计
function updateStudentStats(total, active) {
    document.getElementById('onlineStudents').textContent = total;
    document.getElementById('activeSessions').textContent = active;
}

// 停止监控当前学生（仅前端显示，后台继续处理）
function disconnectCurrentStudent() {
    if (!currentMonitoringStudent) return;
    
    const studentId = currentMonitoringStudent.student_id || currentMonitoringStudent.session_id.substring(0, 8);
    
    // 仅清空当前监控状态，不删除学生会话
    currentMonitoringStudent = null;
    updateCurrentStudentInfo();
    clearDetectionResults();
    stopWhepPlayback();
    try { stopRemoteAudioForwarding(); } catch {}
    stopAudioStatusPolling();
    stopStatePolling();
    
    // 更新学生列表显示，移除选中状态
    updateStudentList();
    
    showNotification(`已停止监控学生 ${studentId}，后台继续处理中`, 'info');
}

// 计算流名（与后端规则一致）
function computeStreamName(exam_id, student_id) {
    function sanitize(s) {
        if (!s) return '';
        return ('' + s).replace(/[^a-zA-Z0-9_-]/g, '');
    }
    const ex = (sanitize(exam_id).slice(0, 8) || 'dev');
    const pid = (sanitize(student_id).slice(0, 8) || 'anon');
    return `exam-${ex}-user-${pid}`;
}

// 更新视频情绪显示（兼容监控模式）
function updateVideoEmotionDisplay(result) {
    try {
        console.log('🔧 [updateVideoEmotionDisplay] 开始处理:', result);
        console.log('🔧 [updateVideoEmotionDisplay] DOM元素状态:', {
            videoDominantEmotion: !!elements.videoDominantEmotion,
            videoDetectionStatus: !!elements.videoDetectionStatus
        });
        // 备用音频事件
        monitorSocket.on('rtsp_audio_analysis', (data) => {
            console.log('🎯 [Monitor收到语音情绪分析] rtsp_audio_analysis:', data);
            try {
                if (currentMode === 'monitor' && currentMonitoringStudent && data.stream_name) {
                    const streamName = currentMonitoringStudent.stream_name || computeStreamName(currentMonitoringStudent.exam_id, currentMonitoringStudent.student_id);
                    if (data.stream_name === streamName) {
                        console.log('✅ [监控模式] 通过Monitor Socket(备用)更新音频分析结果');
                        handleAudioEmotionResult({ result: data.result });
                    }
                }
            } catch (e) { console.warn('❌ Monitor rtsp_audio_analysis handler error:', e); }
        });
        
        if (result && result.dominant_emotion) {
            // 兼容：若未显式提供 face_detected，则按是否有有效情绪推断
            const detected = (typeof result.face_detected === 'boolean')
                ? result.face_detected
                : (result.dominant_emotion && result.dominant_emotion !== 'unknown');
            if (elements.videoDominantEmotion) {
                elements.videoDominantEmotion.textContent = emotionTranslations[result.dominant_emotion] || result.dominant_emotion;
                console.log('✅ [updateVideoEmotionDisplay] 更新主导情绪显示:', result.dominant_emotion);
            } else {
                console.warn('⚠️ [updateVideoEmotionDisplay] videoDominantEmotion 元素不存在');
            }
            
            if (elements.videoDetectionStatus) {
                elements.videoDetectionStatus.textContent = detected ? '检测到面部' : '未检测到面部';
                console.log('✅ [updateVideoEmotionDisplay] 更新面部检测状态:', detected);
            } else {
                console.warn('⚠️ [updateVideoEmotionDisplay] videoDetectionStatus 元素不存在');
            }

            // 同步更新画面覆盖层的人脸检测指示器
            try { updateFaceDetectionIndicator(!!detected); } catch {}
            
            // 更新图表
            if (videoEmotionChart && result.emotions) {
                updateVideoEmotionChart(result.emotions);
                console.log('✅ [updateVideoEmotionDisplay] 更新情绪图表');
            } else {
                console.warn('⚠️ [updateVideoEmotionDisplay] 图表未初始化或无emotions数据');
            }
            
            console.log('🎉 [视频分析更新成功]', {
                emotion: result.dominant_emotion,
                face_detected: detected,
                confidence: result.confidence
            });
        } else {
            console.warn('⚠️ [updateVideoEmotionDisplay] 无效的result数据:', result);
        }
    } catch (e) {
        console.error('❌ 更新视频分析显示失败:', e);
    }
}

// 更新心率显示（兼容监控模式）
function updateHeartRateDisplay(result) {
    try {
        console.log('💓 [updateHeartRateDisplay] 开始处理:', result);
        console.log('💓 [updateHeartRateDisplay] DOM元素状态:', {
            heartRateValue: !!elements.heartRateValue,
            heartRateIcon: !!elements.heartRateIcon,
            progressText: !!elements.progressText
        });
        
        if (result) {
            const hrValue = result.heart_rate || result.heartRate;
            const hrState = result.detection_state || result.state;
            
            console.log('💓 [updateHeartRateDisplay] 解析数据:', { hrValue, hrState });
            
            if (elements.heartRateValue) {
                if (hrValue && typeof hrValue === 'number') {
                    elements.heartRateValue.textContent = Math.round(hrValue);
                    if (elements.heartRateIcon) {
                        elements.heartRateIcon.style.color = '#00d4ff';
                    }
                    console.log('✅ [updateHeartRateDisplay] 更新心率数值:', Math.round(hrValue));
                } else {
                    elements.heartRateValue.textContent = '--';
                    if (elements.heartRateIcon) {
                        elements.heartRateIcon.style.color = '#666';
                    }
                    console.log('✅ [updateHeartRateDisplay] 重置心率数值为--');
                }
            } else {
                console.warn('⚠️ [updateHeartRateDisplay] heartRateValue 元素不存在');
            }
            
            // 更新进度文本
            if (elements.progressText) {
                const stateText = {
                    'waiting': '等待检测人脸',
                    'collecting': '正在采集数据',
                    'counting': '正在采集数据',
                    'analyzing': '正在分析心率',
                    'stable': '心率检测稳定'
                };
                elements.progressText.textContent = stateText[hrState] || '检测中...';
                console.log('✅ [updateHeartRateDisplay] 更新进度文本:', stateText[hrState] || '检测中...');
            } else {
                console.warn('⚠️ [updateHeartRateDisplay] progressText 元素不存在');
            }
            
            console.log('🎉 [心率检测更新成功]', {
                heart_rate: hrValue,
                state: hrState,
                confidence: result.confidence
            });
        }
    } catch (e) {
        console.error('更新心率显示失败:', e);
    }
}

async function startWhepPlaybackForStudent(student) {
    try {
        if (!student) return;
        const streamName = student.stream_name || computeStreamName(student.exam_id, student.student_id);
        console.log('[监控] 开始播放学生流 via WHEP:', streamName);

        // 确保AI端开始拉取（容错：后端会自算rtsp_url）
        try {
            const resp = await fetch('/api/rtsp/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stream_name: streamName })
            });
            let info = null;
            try { info = await resp.json(); } catch {}
            console.log('[监控] /api/rtsp/start 返回:', resp.status, info);
        } catch (e) { console.warn('启动AI RTSP失败（将由AI端重试）:', e); }

        // 建立 WHEP 播放
        whepPc = new RTCPeerConnection({
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        });
        whepMediaStream = new MediaStream();
        whepPc.addTransceiver('video', { direction: 'recvonly' });
        whepPc.addTransceiver('audio', { direction: 'recvonly' });

        whepPc.addEventListener('track', (ev) => {
            if (!ev.streams || !ev.streams[0]) {
                whepMediaStream.addTrack(ev.track);
            }
            const v = document.getElementById('video-preview');
            if (v) {
                v.style.display = 'block';
                v.srcObject = ev.streams && ev.streams[0] ? ev.streams[0] : whepMediaStream;
                try { v.muted = false; } catch {}
                const play = () => v.play().catch(() => {});
                // 立即尝试播放；若因策略失败，点击已是用户手势，一般可成功
                play();
            }
            // 若收到音频轨，启动远端音频转发（兜底，确保有语音情绪）
            try {
                if (ev.track && ev.track.kind === 'audio') {
                    startRemoteAudioForwarding(student);
                }
            } catch (e) { console.warn('启动远端音频转发失败:', e); }
        });

        const offer = await whepPc.createOffer();
        await whepPc.setLocalDescription(offer);
        // 简单等 ICE 完成或 1s
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 1000);
            whepPc.addEventListener('icegatheringstatechange', () => {
                if (whepPc.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); }
            }, { once: true });
        });

        const sdp = whepPc.localDescription?.sdp || '';
        const resp = await fetch(`/api/whep/${encodeURIComponent(streamName)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp', 'Accept': 'application/sdp' },
            body: sdp
        });
        if (!resp.ok) {
            const text = await resp.text();
            showNotification(`WHEP 播放失败: ${resp.status}`, 'error');
            console.error('WHEP failed:', resp.status, text);
            return;
        }
        whepResourceUrl = resp.headers.get('Location') || '';
        const answer = await resp.text();
        await whepPc.setRemoteDescription({ type: 'answer', sdp: answer });
        console.log('[监控] WHEP 视频连接成功');
        showNotification('视频连接成功', 'success');

        // 小延迟后查询 RTSP 消费状态
        setTimeout(async () => {
            try {
                const st = await fetch('/api/rtsp/status').then(r => r.json());
                console.log('[监控] /api/rtsp/status:', st);
                try {
                    const streamName = student.stream_name || computeStreamName(student.exam_id, student.student_id);
                    const consumers = st && st.consumers;
                    const c = consumers && consumers[streamName];
                    // 若发现音频未启动或无数据，启用远端音频转发作为兜底
                    if (!c || !(c.audio_chunks > 0 || c.audio_bytes > 0)) {
                        console.warn('[监控] RTSP未检测到音频数据，启用远端音频转发兜底');
                        startRemoteAudioForwarding(student);
                    }
                } catch(e) { console.warn('检查RTSP音频状态失败:', e); }
            } catch (e) {
                console.warn('查询RTSP状态失败:', e);
            }
        }, 800);
    } catch (e) {
        console.error('WHEP 播放异常:', e);
        showNotification('视频连接异常', 'error');
    }
}

async function stopWhepPlayback() {
    try {
        if (whepPc) {
            try { whepPc.close(); } catch {}
            whepPc = null;
        }
        if (whepResourceUrl) {
            try { await fetch(whepResourceUrl, { method: 'DELETE' }); } catch {}
            whepResourceUrl = null;
        }
        const v = document.getElementById('video-preview');
        if (v) { try { v.srcObject = null; } catch {} v.style.display = 'none'; }
    } catch (e) {
        console.warn('停止WHEP出错:', e);
    }
}

// 启动监控定时器
function startMonitoringTimer() {
    if (monitoringTimer) {
        clearInterval(monitoringTimer);
    }
    
    monitoringTimer = setInterval(() => {
        if (currentMode === 'monitor') {
            refreshStudentList();
            if (currentMonitoringStudent) {
                updateCurrentStudentInfo();
            }
        }
    }, 5000); // 每5秒刷新一次
}

// ====== 远端音频转发（从WHEP媒体流捕获并转发给AI，以获得语音情绪） ======
let remoteAudioRecorder = null;
function startRemoteAudioForwarding(student) {
    try {
        if (!whepMediaStream) {
            console.warn('[音频兜底] 无WHEP媒体流，无法转发');
            return;
        }
        const hasAudio = whepMediaStream.getAudioTracks && whepMediaStream.getAudioTracks().length > 0;
        if (!hasAudio) {
            console.warn('[音频兜底] WHEP媒体流无音频轨');
            return;
        }
        const options = {};
        const preferred = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'];
        for (const t of preferred) {
            if (MediaRecorder.isTypeSupported(t)) { options.mimeType = t; break; }
        }
        remoteAudioRecorder = new MediaRecorder(whepMediaStream, options);
        remoteAudioRecorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0 && socket && socket.connected && student && student.session_id) {
                const reader = new FileReader();
                reader.onload = () => {
                    socket.emit('audio_data', { session_id: student.session_id, audio_data: reader.result });
                };
                reader.readAsDataURL(ev.data);
            }
        };
        remoteAudioRecorder.start(3000);
        console.log('[音频兜底] 已启动远端音频转发');
        if (elements.audioDetectionStatus) elements.audioDetectionStatus.textContent = '音频分析中...';
    } catch (e) {
        console.warn('[音频兜底] 启动失败:', e);
    }
}
function stopRemoteAudioForwarding() {
    try { if (remoteAudioRecorder) { if (remoteAudioRecorder.state !== 'inactive') remoteAudioRecorder.stop(); remoteAudioRecorder = null; console.log('[音频兜底] 已停止远端音频转发'); } } catch {}
}

// ============ 简化直连：HTTP轮询分析状态 ============
function startStatePollingForStudent(student) {
    stopStatePolling();
    if (!student) return;
    const streamName = student.stream_name || computeStreamName(student.exam_id, student.student_id);
    console.log('[Poller] 开始轮询分析状态：', streamName);
    let lastVersion = -1;
    statePollTimer = setInterval(async () => {
        try {
            const resp = await fetch(`/api/monitor/state?stream_name=${encodeURIComponent(streamName)}`);
            if (!resp.ok) return;
            const data = await resp.json();
            const st = data && data.state;
            if (!st) return;
            if (typeof st.version === 'number' && st.version === lastVersion) return; // 无增量
            lastVersion = st.version || lastVersion;
            console.log('[Poller] 最新状态:', st);
            if (st.video) {
                updateVideoEmotionDisplay(st.video);
                if (st.video.dominant_emotion) {
                    updateVideoEmotionResult({ dominant: st.video.dominant_emotion });
                    updateTrendData('video', st.video.dominant_emotion, st.video.timestamp || new Date().toISOString());
                }
            }
            if (st.heart) {
                updateHeartRateDisplay(st.heart);
            }
            if (st.audio) {
                // 覆盖占位文案，显示语音情绪
                handleAudioEmotionResult({ result: st.audio });
            }
        } catch (e) {
            // 静默失败，继续轮询
        }
    }, 1000);
}

// ==== RTSP 音频状态指示 ====
function startAudioStatusPolling(student) {
    stopAudioStatusPolling();
    if (!student) return;
    const el = document.getElementById('rtspAudioStatus');
    const streamName = student.stream_name || computeStreamName(student.exam_id, student.student_id);
    audioStatusTimer = setInterval(async () => {
        try {
            const st = await fetch('/api/rtsp/status').then(r => r.json());
            const cons = st && st.consumers;
            const c = cons && cons[streamName];
            if (!el) return;
            if (!c) { el.textContent = '音频状态: 未启动'; el.style.color = '#ccc'; return; }
            if (!c.audio_started) { el.textContent = '音频状态: 未启动'; el.style.color = '#ccc'; return; }
            const chunks = c.audio_chunks || 0;
            const lastAge = (typeof c.audio_last_age_sec === 'number') ? c.audio_last_age_sec : null;
            if (chunks > 0 && lastAge !== null && lastAge < 5) {
                el.textContent = `音频状态: 活跃 (段=${chunks})`;
                el.style.color = '#00d4ff';
            } else if (chunks > 0) {
                el.textContent = `音频状态: 间歇 (段=${chunks})`;
                el.style.color = '#ffcc00';
            } else {
                el.textContent = '音频状态: 无数据';
                el.style.color = '#ccc';
            }
        } catch { /* ignore */ }
    }, 1500);
}

function stopAudioStatusPolling() {
    if (audioStatusTimer) { clearInterval(audioStatusTimer); audioStatusTimer = null; }
    const el = document.getElementById('rtspAudioStatus');
    if (el) { el.textContent = '音频状态: --'; el.style.color = '#ccc'; }
}

function stopStatePolling() {
    if (statePollTimer) {
        clearInterval(statePollTimer);
        statePollTimer = null;
        console.log('[Poller] 已停止状态轮询');
    }
}

// WebSocket事件处理函数
function handleStudentConnected(data) {
    console.log('[教师端] 收到学生连接通知:', {
        session_id: data.session_id?.substring(0, 8) + '...',
        student_id: data.student_id,
        exam_id: data.exam_id,
        timestamp: data.timestamp
    });
    console.log('[调试] 教师端正常: 学生端已成功连接并通知教师端');
    
    showNotification(`学生 ${data.student_id || data.session_id.substring(0, 8)} 已连接`, 'info');
    if (currentMode === 'monitor') {
        console.log('[教师端] 当前在监控模式，刷新学生列表');
        refreshStudentList();
    } else {
        console.log('[教师端] 当前不在监控模式，学生连接已记录但不刷新列表');
    }
}

function handleStudentDetectionStopped(data) {
    showNotification(`学生检测已停止`, 'warning');
    if (currentMode === 'monitor') {
        refreshStudentList();
    }
}

function handleStudentVideoStream(data) {
    console.log('[教师端] 收到学生视频流数据:', {
        session_id: data.session_id?.substring(0, 8) + '...',
        student_id: data.student_id,
        frame_data_size: data.frame_data ? data.frame_data.length : 0,
        timestamp: data.timestamp
    });
    console.log('[调试] 教师端正常: 已从学生端接收到视频流数据');
    
    // 检查监控模式和当前监控学生
    if (currentMode !== 'monitor') {
        console.log('[教师端] 当前不在监控模式，忽略视频流');
        console.log('[调试] 教师端问题: 界面未切换到学生监控模式');
        return;
    }
    
    if (!currentMonitoringStudent) {
        console.log('[教师端] 未选择监控学生，忽略视频流');
        console.log('[调试] 教师端问题: 未在学生列表中点击选择要监控的学生');
        return;
    }
    
    if (data.session_id !== currentMonitoringStudent.session_id) {
        console.log('[教师端] 视频流不属于当前监控学生，忽略');
        console.log('[调试] 教师端状态: 当前监控学生:', currentMonitoringStudent.student_id, '但收到的是其他学生的视频流');
        return;
    }
    
    console.log('[教师端] 视频流匹配当前监控学生，开始显示');
    console.log('[调试] 监控状态正常: 准备在界面显示学生视频');
    
    // 显示视频帧到canvas或img元素
    if (data.frame_data) {
        try {
            console.log('[教师端] 开始处理视频帧显示');
            
            // 首先尝试更新canvas（如果在检测中）
            const canvas = document.getElementById('video-canvas');
            if (canvas) {
                console.log('[教师端] 找到video-canvas元素，正在绘制视频帧');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.onload = function() {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    canvas.style.display = 'block';
                    console.log('[教师端] 视频帧已成功绘制到canvas');
                    console.log('[调试] 教师端正常: 视频流已在监控界面成功显示');
                };
                img.onerror = function() {
                    console.error('[教师端] 视频帧加载失败');
                    console.log('[调试] 教师端问题: 视频帧数据格式错误或损坏');
                };
                img.src = data.frame_data;
            } else {
                console.log('[教师端] 未找到video-canvas元素');
                console.log('[调试] 教师端问题: 监控界面缺少video-canvas元素');
            }
            
            // 同时更新video-preview（作为备用显示）
            const videoPreview = document.getElementById('video-preview');
            if (videoPreview) {
                console.log('[教师端] 找到video-preview元素，正在更新显示');
                // 对于img元素，直接设置src
                if (videoPreview.tagName === 'IMG') {
                    videoPreview.src = data.frame_data;
                    videoPreview.style.display = 'block';
                    console.log('[教师端] 视频帧已显示在video-preview (IMG)');
                }
                // 对于video元素，隐藏它，因为我们显示的是图像帧，不是视频流
                else if (videoPreview.tagName === 'VIDEO') {
                    videoPreview.style.display = 'none';
                    console.log('[教师端] video-preview是VIDEO元素，已隐藏');
                }
            } else {
                console.log('[教师端] 未找到video-preview元素');
                console.log('[调试] 教师端问题: 监控界面缺少video-preview元素');
            }
        } catch (error) {
            console.error('[教师端] 显示学生视频流失败:', error);
            console.log('[调试] 教师端问题: 视频显示处理时发生JavaScript错误');
        }
    } else {
        console.log('[教师端] 视频流数据为空');
        console.log('[调试] 学生端问题: 学生端发送的视频帧数据为空');
    }
}

function handleStudentAudioStream(data) {
    // 音频流处理（可以添加音频可视化）
    if (currentMode === 'monitor' && currentMonitoringStudent && 
        data.session_id === currentMonitoringStudent.session_id) {
        // TODO: 实现音频流可视化
    }
}

function handleStudentVideoEmotionResult(data) {
    console.log('[教师端] 收到学生视频情绪分析结果:', {
        session_id: data.session_id?.substring(0, 8) + '...',
        student_id: data.student_id,
        dominant_emotion: data.result?.dominant_emotion,
        confidence: data.result?.confidence,
        face_detected: data.result?.face_detected
    });
    console.log('[调试] 教师端正常: 已从学生端接收到视频情绪分析结果');
    
    if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.session_id)) {
        console.log('[教师端] 开始更新视频情绪分析界面显示');
        try {
            // 标准化 result 结构并更新显示
            // 1) 直接使用兼容显示函数（支持 dominant_emotion/face_detected/emotions）
            updateVideoEmotionDisplay(data.result);
            // 2) 同步更新旧版结果显示（期望 { dominant } 结构）
            if (data.result && typeof data.result.dominant_emotion === 'string') {
                updateVideoEmotionResult({ dominant: data.result.dominant_emotion });
            }
            // 3) 更新趋势（需要传入字符串 + 时间戳）
            if (data.result && data.result.dominant_emotion) {
                updateTrendData('video', data.result.dominant_emotion, data.result.timestamp || new Date().toISOString());
            }
            console.log('[教师端] 视频情绪分析结果已更新到界面');
        } catch (error) {
            console.error('[教师端] 更新视频情绪显示失败:', error);
        }
    } else {
        console.log('[教师端] 不满足显示条件，忽略情绪结果');
        console.log('[调试] 教师端状态: 模式=' + currentMode + ', 监控学生=' + (currentMonitoringStudent ? currentMonitoringStudent.student_id : '无'));
    }
}

function handleStudentAudioEmotionResult(data) {
    if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.session_id)) {
        try {
            // 将结果转换为旧版显示函数的入参格式 { dominant, quality }
            const audioDisplay = {
                dominant: (data.result && data.result.dominant_emotion) || 'unknown',
                quality: data.result && (data.result.analysis_quality || data.result.quality)
            };
            updateAudioEmotionResult(audioDisplay);
            if (data.result && data.result.emotions) {
                updateAudioEmotionChart(data.result.emotions);
            }
            if (data.result && data.result.dominant_emotion) {
                updateTrendData('audio', data.result.dominant_emotion, data.result.timestamp || new Date().toISOString());
            }
        } catch (e) {
            console.warn('更新学生音频情绪显示失败:', e);
        }
    }
}

function handleStudentHeartRateResult(data) {
    console.log('[教师端] 收到学生心率检测结果:', {
        session_id: data.session_id?.substring(0, 8) + '...',
        student_id: data.student_id,
        detection_state: data.result?.detection_state,
        heart_rate: data.result?.heart_rate,
        confidence: data.result?.confidence,
        buffer_size: data.result?.buffer_size
    });
    console.log('[调试] 教师端正常: 已从学生端接收到心率检测结果');
    
    if (currentMode === 'monitor' && currentMonitoringStudent && _matchesCurrentStudentSession(data.session_id)) {
        
        console.log('[教师端] 开始更新心率检测界面显示');
        
        try {
            // 使用现有的处理函数显示结果
            updateHeartRateDisplay(data.result);
            console.log('[教师端] 心率检测结果已更新到界面');
            console.log('[调试] 教师端正常: 心率检测结果已成功显示在监控界面');
        } catch (error) {
            console.error('[教师端] 更新心率显示失败:', error);
            console.log('[调试] 教师端问题: 心率检测结果界面更新时发生错误');
        }
    } else {
        console.log('[教师端] 不满足显示条件，忽略心率结果');
        console.log('[调试] 教师端状态: 模式=' + currentMode + ', 监控学生=' + (currentMonitoringStudent ? currentMonitoringStudent.student_id : '无'));
    }
}

// 工具函数
function formatTime(timeString) {
    const date = new Date(timeString);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

function clearDetectionResults() {
    // 清空视频浏览区域
    const videoPreview = document.getElementById('video-preview');
    const videoCanvas = document.getElementById('video-canvas');
    const faceDetectionStatus = document.getElementById('faceDetectionStatus');
    
    if (videoPreview) {
        videoPreview.style.display = 'none';
        videoPreview.srcObject = null;
        videoPreview.src = '';
    }
    
    if (videoCanvas) {
        videoCanvas.style.display = 'none';
        const ctx = videoCanvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
        }
    }
    
    if (faceDetectionStatus) {
        faceDetectionStatus.innerHTML = '<i class="fas fa-search"></i><span>等待开始分析...</span>';
    }
    
    // 清空情绪检测结果
    document.getElementById('videoDominantEmotion').textContent = '--';
    document.getElementById('videoDetectionStatus').textContent = '待检测';
    document.getElementById('audioDominantEmotion').textContent = '--';
    document.getElementById('audioDetectionStatus').textContent = '待检测';
    
    // 清空心率显示
    document.getElementById('heartRateValue').textContent = '--';
    
    // 隐藏心率进度条
    const heartRateProgress = document.getElementById('heartRateProgress');
    if (heartRateProgress) {
        heartRateProgress.style.display = 'none';
    }
    
    // 清空音频可视化画布
    const audioCanvas = document.getElementById('audio-canvas');
    if (audioCanvas) {
        const audioCtx = audioCanvas.getContext('2d');
        if (audioCtx) {
            audioCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
        }
    }
    
    // 重置音频状态指示器
    const audioStatusIndicator = document.getElementById('audio-status-indicator');
    if (audioStatusIndicator) {
        audioStatusIndicator.style.background = '#ff0000';
        audioStatusIndicator.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.6)';
    }
    
    // 重置音频级别显示
    const audioLevel = document.getElementById('audio-level');
    if (audioLevel) {
        audioLevel.style.setProperty('--audio-level', '0%');
        const volumeText = audioLevel.querySelector('.volume-text');
        if (volumeText) {
            volumeText.textContent = '0.0';
        }
    }
    
    // 清空图表数据，但保持图表结构
    if (audioEmotionChart) {
        // 重置为初始状态，保持颜色配置
        const initialData = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // 9种情绪
        audioEmotionChart.data.datasets[0].data = initialData;
        audioEmotionChart.update();
    }
    if (videoEmotionChart) {
        const initialData = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // 9种情绪
        videoEmotionChart.data.datasets[0].data = initialData;
        videoEmotionChart.update();
    }
    
    // 清空趋势图表
    if (emotionTrendChart) {
        emotionTrendData.labels = [];
        emotionTrendData.audioData = [];
        emotionTrendData.videoData = [];
        emotionTrendChart.data.labels = [];
        emotionTrendChart.data.datasets[0].data = [];
        emotionTrendChart.data.datasets[1].data = [];
        emotionTrendChart.update();
    }
}

// 清空会话功能已被移除

// 删除学生确认弹窗相关函数
let pendingRemoveSessionId = null;

function showRemoveStudentConfirm(sessionId, studentId) {
    pendingRemoveSessionId = sessionId;
    const overlay = document.getElementById('confirmDialogOverlay');
    const message = document.getElementById('confirmDialogMessage');
    message.textContent = `确定要断开与学生 "${studentId}" 的连接吗？此操作将终止该学生的视音频流传输、数据传输和AI报告生成。`;
    overlay.style.display = 'flex';
    
    // 设置动画效果
    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 10);
}

function hideRemoveStudentConfirm() {
    const overlay = document.getElementById('confirmDialogOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        pendingRemoveSessionId = null;
    }, 300);
}

async function confirmRemoveStudent() {
    if (!pendingRemoveSessionId) return;
    
    try {
        const response = await fetch('/api/disconnect_student', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: pendingRemoveSessionId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 从学生列表中移除
            studentSessions = studentSessions.filter(s => s.session_id !== pendingRemoveSessionId);
            
            // 如果删除的是当前监控的学生，清空当前监控
            if (currentMonitoringStudent?.session_id === pendingRemoveSessionId) {
                currentMonitoringStudent = null;
                updateCurrentStudentInfo();
                clearDetectionResults();
            }
            
            // 更新学生列表显示
            updateStudentList();
            
            // 更新统计信息
            const totalStudents = studentSessions.length;
            const activeStudents = studentSessions.filter(s => s.status === 'active').length;
            updateStudentStats(totalStudents, activeStudents);
            
            showNotification(result.message || '学生连接已断开', 'success');
        } else {
            showNotification(result.message || '断开连接失败', 'error');
        }
    } catch (error) {
        console.error('断开学生连接失败:', error);
        showNotification('断开连接失败', 'error');
    }
    
    hideRemoveStudentConfirm();
}

// 初始化删除确认弹窗事件监听器
document.addEventListener('DOMContentLoaded', function() {
    const confirmCancel = document.getElementById('confirmDialogCancel');
    const confirmConfirm = document.getElementById('confirmDialogConfirm');
    const overlay = document.getElementById('confirmDialogOverlay');
    
    if (confirmCancel) {
        confirmCancel.addEventListener('click', hideRemoveStudentConfirm);
    }
    
    if (confirmConfirm) {
        confirmConfirm.addEventListener('click', confirmRemoveStudent);
    }
    
    // 点击背景关闭弹窗
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideRemoveStudentConfirm();
            }
        });
    }
    
    // ESC键关闭弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && pendingRemoveSessionId) {
            hideRemoveStudentConfirm();
        }
    });
});

// 测试Socket.IO连接状态
async function testSocketIOConnection() {
    console.log('=== Socket.IO连接测试 ===');
    
    try {
        // 1. 检查Socket连接状态
        console.log('1. Socket连接状态:');
        console.log('  - socket.connected:', socket?.connected);
        console.log('  - socket.id:', socket?.id);
        console.log('  - monitorSocket.connected:', monitorSocket?.connected);
        console.log('  - monitorSocket.id:', monitorSocket?.id);
        
        // 2. 获取AI服务状态
        console.log('2. 获取AI服务状态:');
        const statusResp = await fetch('/api/socketio/status');
        const statusData = await statusResp.json();
        console.log('  - AI服务状态:', statusData);
        
        // 3. 发送测试事件
        console.log('3. 发送测试事件:');
        if (socket && socket.connected) {
            socket.emit('test_connection', { message: '测试连接', timestamp: new Date().toISOString() });
            console.log('  - 已发送test_connection事件');
        }
        
        if (monitorSocket && monitorSocket.connected) {
            monitorSocket.emit('test_monitor', { message: '测试监控', timestamp: new Date().toISOString() });
            console.log('  - 已发送test_monitor事件');
        }
        
        // 4. 检查RTSP状态
        console.log('4. 检查RTSP状态:');
        const rtspResp = await fetch('/api/rtsp/status');
        const rtspData = await rtspResp.json();
        console.log('  - RTSP状态:', rtspData);
        
        showNotification('Socket.IO测试完成，请查看控制台日志', 'info');
        
    } catch (error) {
        console.error('Socket.IO测试失败:', error);
        showNotification('Socket.IO测试失败: ' + error.message, 'error');
    }
}

// Socket连接状态检查和自动重连机制
let connectionCheckInterval = null;

function startConnectionMonitor() {
    console.log('启动Socket连接监控...');
    
    // 清除之前的定时器
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    connectionCheckInterval = setInterval(() => {
        checkAndRepairConnections();
    }, 30000); // 每30秒检查一次
}

function checkAndRepairConnections() {
    console.log('检查Socket连接状态...');
    
    // 检查主Socket连接
    if (!socket || !socket.connected) {
        console.warn('主Socket连接丢失，尝试重新连接...');
        connectWebSocket();
    } else {
        console.log('主Socket连接正常, ID:', socket.id);
    }
    
    // 检查Monitor Socket连接
    if (!monitorSocket || !monitorSocket.connected) {
        console.warn('Monitor Socket连接丢失，尝试重新连接...');
        connectMonitorSocket();
    } else {
        console.log('Monitor Socket连接正常, ID:', monitorSocket.id);
    }
}

// 在应用初始化完成后启动连接监控
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        startConnectionMonitor();
    }, 5000); // 延迟5秒后开始监控，确保初始连接完成
});

