// 检测记录管理系统

// 情绪映射（中文显示）
const emotionMap = {
    'angry': '愤怒',
    'disgust': '厌恶', 
    'fear': '恐惧',
    'happy': '快乐',
    'sad': '悲伤',
    'surprise': '惊讶',
    'neutral': '中性',
    'fearful': '恐惧',
    'disgusted': '厌恶',
    'surprised': '惊讶',
    'other': '其他',
    'unknown': '未知'
};

// 全局变量
let allRecords = [];
let selectedRecord = null;
let currentCharts = {};

// DOM元素
const elements = {
    recordsList: document.getElementById('recordsList'),
    detailContent: document.getElementById('detailContent'),
    recordsCount: document.getElementById('records-count'),
    backBtn: document.getElementById('back-btn'),
    refreshBtn: document.getElementById('refresh-records-btn'),
    aiAnalysisBtn: document.getElementById('ai-analysis-btn'),
    exportRecordBtn: document.getElementById('export-record-btn'),
    deleteRecordBtn: document.getElementById('delete-record-btn'),
    aiAnalysisModal: document.getElementById('aiAnalysisModal'),
    closeAiModal: document.getElementById('closeAiModal'),
    closeReportBtn: document.getElementById('closeReportBtn'),
    exportReportBtn: document.getElementById('exportReportBtn'),
    analysisLoading: document.getElementById('analysisLoading'),
    analysisResult: document.getElementById('analysisResult'),
    reportContent: document.getElementById('reportContent'),
    notificationContainer: document.getElementById('notificationContainer')
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('检测记录页面初始化...');
    initializeEventListeners();
    loadRecords();
});

// 事件监听器
function initializeEventListeners() {
    if (elements.backBtn) {
        elements.backBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }

    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', loadRecords);
    }

    if (elements.aiAnalysisBtn) {
        elements.aiAnalysisBtn.addEventListener('click', performAIAnalysis);
    }

    if (elements.exportRecordBtn) {
        elements.exportRecordBtn.addEventListener('click', exportSelectedRecord);
    }

    if (elements.deleteRecordBtn) {
        elements.deleteRecordBtn.addEventListener('click', deleteSelectedRecord);
    }

    if (elements.closeAiModal) {
        elements.closeAiModal.addEventListener('click', closeAIModal);
    }

    if (elements.closeReportBtn) {
        elements.closeReportBtn.addEventListener('click', closeAIModal);
    }

    if (elements.exportReportBtn) {
        elements.exportReportBtn.addEventListener('click', exportAIReport);
    }

    // 点击模态框外部关闭
    if (elements.aiAnalysisModal) {
        elements.aiAnalysisModal.addEventListener('click', (e) => {
            if (e.target === elements.aiAnalysisModal) {
                closeAIModal();
            }
        });
    }
}

// 加载记录列表
async function loadRecords() {
    try {
        showNotification('正在加载记录...', 'info');
        
        const response = await fetch('/api/records');
        const result = await response.json();

        if (result.success) {
            allRecords = result.records;
            displayRecords();
            elements.recordsCount.textContent = `${allRecords.length} 条记录`;
            showNotification('记录加载完成', 'success');
        } else {
            showError('加载记录失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载记录失败:', error);
        showError('加载记录失败: ' + error.message);
    }
}

// 显示记录列表
function displayRecords() {
    if (!allRecords || allRecords.length === 0) {
        elements.recordsList.innerHTML = `
            <div class="no-records">
                <i class="fas fa-inbox"></i>
                <p>暂无检测记录</p>
            </div>
        `;
        return;
    }

    elements.recordsList.innerHTML = allRecords.map(record => `
        <div class="record-item" data-session-id="${record.session_id}">
            <div class="record-header">
                <div class="record-title">检测记录 ${record.session_id.slice(0, 8)}</div>
                <div class="record-time">${record.start_time ? formatDateTime(record.start_time) : '未知时间'}</div>
            </div>
            <div class="record-summary">
                <div class="summary-item">
                    <span>持续时长:</span>
                    <span class="summary-value">${formatDuration(record.statistics?.duration_seconds || 0)}</span>
                </div>
                <div class="summary-item">
                    <span>主要情绪:</span>
                    <span class="summary-value">${emotionMap[record.statistics?.dominant_video_emotion || record.statistics?.dominant_audio_emotion] || '未知'}</span>
                </div>
                <div class="summary-item">
                    <span>平均心率:</span>
                    <span class="summary-value">${record.statistics?.average_heart_rate ? Math.round(record.statistics.average_heart_rate) : '--'} ${record.statistics?.average_heart_rate ? 'bpm' : ''}</span>
                </div>
                <div class="summary-item">
                    <span>分析次数:</span>
                    <span class="summary-value">${(record.statistics?.total_video_analyses || 0) + (record.statistics?.total_audio_analyses || 0)}</span>
                </div>
            </div>
        </div>
    `).join('');

    // 为每个记录项添加点击事件
    document.querySelectorAll('.record-item').forEach(item => {
        item.addEventListener('click', () => selectRecord(item.dataset.sessionId));
    });
}

// 选择记录
function selectRecord(sessionId) {
    // 移除之前的选中状态
    document.querySelectorAll('.record-item').forEach(item => {
        item.classList.remove('selected');
    });

    // 添加新的选中状态
    const selectedItem = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }

    // 找到选中的记录
    selectedRecord = allRecords.find(record => record.session_id === sessionId);
    
    if (selectedRecord) {
        displayRecordDetails(selectedRecord);
        // 启用操作按钮
        elements.aiAnalysisBtn.disabled = false;
        elements.exportRecordBtn.disabled = false;
        elements.deleteRecordBtn.disabled = false;
    }
}

// 显示记录详情
function displayRecordDetails(record) {
    const startTime = new Date(record.start_time);
    const endTime = new Date(record.end_time);
    const duration = record.statistics?.duration_seconds || 0;

    elements.detailContent.innerHTML = `
        <div class="record-details">
            <!-- 基本信息 -->
            <div class="details-section">
                <h4><i class="fas fa-info-circle"></i> 基本信息</h4>
                <div class="session-info">
                    <div class="info-item">
                        <span class="info-label">会话ID:</span>
                        <span class="info-value">${record.session_id}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">开始时间:</span>
                        <span class="info-value">${record.start_time ? formatDateTime(record.start_time) : '未知'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">结束时间:</span>
                        <span class="info-value">${record.end_time ? formatDateTime(record.end_time) : '未知'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">持续时长:</span>
                        <span class="info-value">${formatDuration(duration)}</span>
                    </div>
                </div>
            </div>

            <!-- 统计信息 -->
            <div class="details-section">
                <h4><i class="fas fa-chart-bar"></i> 统计概览</h4>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${record.statistics?.total_video_analyses || 0}</div>
                        <div class="stat-label">面部分析</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${record.statistics?.total_audio_analyses || 0}</div>
                        <div class="stat-label">语音分析</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${record.statistics?.total_heart_rate_readings || 0}</div>
                        <div class="stat-label">心率检测</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${Math.round(record.statistics?.average_heart_rate || 0)} bpm</div>
                        <div class="stat-label">平均心率</div>
                    </div>
                </div>
            </div>

            <!-- 情绪趋势图 -->
            <div class="details-section">
                <h4><i class="fas fa-chart-line"></i> 情绪变化趋势</h4>
                <div class="chart-container">
                    <canvas id="emotionTrendChart"></canvas>
                </div>
            </div>

            <!-- 心率趋势图 -->
            <div class="details-section">
                <h4><i class="fas fa-heartbeat"></i> 心率变化趋势</h4>
                <div class="chart-container">
                    <canvas id="heartRateTrendChart"></canvas>
                </div>
            </div>

            <!-- 情绪分布图 -->
            <div class="details-section">
                <h4><i class="fas fa-chart-pie"></i> 情绪分布</h4>
                <div class="chart-container">
                    <canvas id="emotionDistributionChart"></canvas>
                </div>
            </div>
        </div>
    `;

    // 绘制图表
    setTimeout(() => {
        drawEmotionTrendChart(record);
        drawHeartRateTrendChart(record);
        drawEmotionDistributionChart(record);
    }, 100);
}

// 绘制情绪趋势图
function drawEmotionTrendChart(record) {
    const canvas = document.getElementById('emotionTrendChart');
    if (!canvas) return;

    // 销毁之前的图表
    if (currentCharts.emotionTrend) {
        currentCharts.emotionTrend.destroy();
    }

    const ctx = canvas.getContext('2d');
    
    // 准备数据
    const videoEmotions = record.video_emotions || [];
    const audioEmotions = record.audio_emotions || [];
    
    const startTime = new Date(record.start_time);
    
    const videoData = videoEmotions.map(item => ({
        x: (new Date(item.timestamp) - startTime) / 1000,
        y: getEmotionIntensity(item.dominant_emotion, item.emotions)
    }));
    
    const audioData = audioEmotions.map(item => ({
        x: (new Date(item.timestamp) - startTime) / 1000,
        y: getEmotionIntensity(item.dominant_emotion, item.emotions)
    }));

    currentCharts.emotionTrend = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '面部情绪强度',
                data: videoData,
                borderColor: '#00ffff',
                backgroundColor: 'rgba(0, 255, 255, 0.1)',
                tension: 0.4,
                pointRadius: 2
            }, {
                label: '语音情绪强度',
                data: audioData,
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                tension: 0.4,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: '时间 (秒)',
                        color: '#cccccc'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#cccccc'
                    }
                },
                y: {
                    min: 0,
                    max: 1,
                    title: {
                        display: true,
                        text: '情绪强度',
                        color: '#cccccc'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#cccccc'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#cccccc'
                    }
                }
            },
            elements: {
                point: {
                    backgroundColor: 'rgba(0, 255, 255, 0.8)'
                }
            }
        }
    });
}

// 绘制心率趋势图
function drawHeartRateTrendChart(record) {
    const canvas = document.getElementById('heartRateTrendChart');
    if (!canvas) return;

    if (currentCharts.heartRateTrend) {
        currentCharts.heartRateTrend.destroy();
    }

    const ctx = canvas.getContext('2d');
    
    const heartRateData = record.heart_rate_data || [];
    const startTime = new Date(record.start_time);
    
    const data = heartRateData.map(item => ({
        x: (new Date(item.timestamp) - startTime) / 1000,
        y: item.heart_rate
    }));

    currentCharts.heartRateTrend = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '心率 (bpm)',
                data: data,
                borderColor: '#ff0064',
                backgroundColor: 'rgba(255, 0, 100, 0.1)',
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#ff0064'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: '时间 (秒)',
                        color: '#cccccc'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#cccccc'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '心率 (bpm)',
                        color: '#cccccc'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#cccccc'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#cccccc'
                    }
                }
            }
        }
    });
}

// 绘制情绪分布图
function drawEmotionDistributionChart(record) {
    const canvas = document.getElementById('emotionDistributionChart');
    if (!canvas) {
        console.error('情绪分布图画布不存在');
        return;
    }

    if (currentCharts.emotionDistribution) {
        currentCharts.emotionDistribution.destroy();
    }

    const ctx = canvas.getContext('2d');
    
    const distribution = record.statistics?.video_emotion_distribution || {};
    console.log('情绪分布数据:', distribution);
    
    // 如果没有视频情绪分布，尝试使用音频情绪分布
    let finalDistribution = distribution;
    if (Object.keys(distribution).length === 0) {
        finalDistribution = record.statistics?.audio_emotion_distribution || {};
        console.log('使用音频情绪分布:', finalDistribution);
    }
    
    // 如果仍然没有数据，从原始数据计算
    if (Object.keys(finalDistribution).length === 0) {
        console.log('从原始数据计算情绪分布...');
        const videoEmotions = record.video_emotions || [];
        const audioEmotions = record.audio_emotions || [];
        
        finalDistribution = {};
        [...videoEmotions, ...audioEmotions].forEach(emotion => {
            const dominant = emotion.dominant_emotion;
            if (dominant) {
                finalDistribution[dominant] = (finalDistribution[dominant] || 0) + 1;
            }
        });
        console.log('计算得到的情绪分布:', finalDistribution);
    }
    
    const labels = Object.keys(finalDistribution).map(emotion => emotionMap[emotion] || emotion);
    const data = Object.values(finalDistribution);
    
    console.log('图表标签:', labels);
    console.log('图表数据:', data);
    
    if (labels.length === 0 || data.length === 0) {
        // 显示无数据的占位图
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#666666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂无情绪分布数据', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const colors = [
        '#00ffff', '#ff6b6b', '#4ecdc4', '#45b7d1', 
        '#96ceb4', '#ffa726', '#ab47bc', '#66bb6a'
    ];

    currentCharts.emotionDistribution = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length).map(color => color + '80'),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#cccccc',
                        padding: 15,
                        usePointStyle: true
                    }
                }
            }
        }
    });
    
    console.log('情绪分布图绘制完成');
}

// AI分析功能
async function performAIAnalysis() {
    if (!selectedRecord) {
        showError('请先选择一条记录');
        return;
    }

    // 显示模态框
    elements.aiAnalysisModal.style.display = 'flex';
    elements.analysisLoading.style.display = 'block';
    elements.analysisResult.style.display = 'none';

    try {
        const response = await fetch('/api/ai_analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: selectedRecord.session_id
            })
        });

        const result = await response.json();

        if (result.success) {
            elements.analysisLoading.style.display = 'none';
            elements.analysisResult.style.display = 'block';
            elements.reportContent.innerHTML = formatAIReport(result.analysis);
            elements.exportReportBtn.style.display = 'inline-flex';
            
            // 保存报告内容以供导出
            window.currentAIReport = result.analysis;
        } else {
            closeAIModal();
            showError('AI分析失败: ' + result.message);
        }
    } catch (error) {
        console.error('AI分析失败:', error);
        closeAIModal();
        showError('AI分析失败: ' + error.message);
    }
}

// 格式化AI报告
function formatAIReport(analysisText) {
    // 将AI返回的文本转换为HTML格式
    return analysisText
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

// 关闭AI分析模态框
function closeAIModal() {
    elements.aiAnalysisModal.style.display = 'none';
    elements.exportReportBtn.style.display = 'none';
    window.currentAIReport = null;
}

// 导出AI分析报告
function exportAIReport() {
    if (!window.currentAIReport || !selectedRecord) {
        showError('没有可导出的报告');
        return;
    }

    try {
        // 生成报告文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionId = selectedRecord.session_id.slice(0, 8);
        const filename = `AI心理分析报告_${sessionId}_${timestamp}.txt`;
        
        // 创建报告内容
        const reportHeader = `AI心理分析报告\n` +
            `==========================================\n` +
            `会话ID: ${selectedRecord.session_id}\n` +
            `生成时间: ${new Date().toLocaleString('zh-CN')}\n` +
            `检测时间: ${selectedRecord.start_time ? formatDateTime(selectedRecord.start_time) : '未知'}\n` +
            `==========================================\n\n`;
        
        const fullReport = reportHeader + window.currentAIReport;
        
        // 创建下载
        const dataBlob = new Blob([fullReport], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('AI分析报告导出成功', 'success');
    } catch (error) {
        console.error('导出报告失败:', error);
        showError('导出报告失败: ' + error.message);
    }
}

// 导出选中记录
async function exportSelectedRecord() {
    if (!selectedRecord) {
        showError('请先选择一条记录');
        return;
    }

    try {
        const dataStr = JSON.stringify(selectedRecord, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `detection_record_${selectedRecord.session_id}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('记录导出成功', 'success');
    } catch (error) {
        console.error('导出失败:', error);
        showError('导出失败: ' + error.message);
    }
}

// 删除选中记录
async function deleteSelectedRecord() {
    if (!selectedRecord) {
        showError('请先选择一条记录');
        return;
    }

    const confirmation = confirm(`确定要删除这条记录吗？\n\n会话ID: ${selectedRecord.session_id}\n时间: ${formatDateTime(selectedRecord.start_time)}\n\n此操作不可撤销。`);
    
    if (!confirmation) {
        return;
    }

    try {
        const response = await fetch(`/api/records/${selectedRecord.session_id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification('记录删除成功', 'success');
            // 重新加载记录列表
            await loadRecords();
            // 清空详情显示
            elements.detailContent.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer"></i>
                    <p>请选择一条记录查看详情</p>
                </div>
            `;
            selectedRecord = null;
            elements.aiAnalysisBtn.disabled = true;
            elements.exportRecordBtn.disabled = true;
            elements.deleteRecordBtn.disabled = true;
        } else {
            showError('删除记录失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除记录失败:', error);
        showError('删除记录失败: ' + error.message);
    }
}

// 工具函数
function formatDateTime(timeString) {
    if (!timeString) return '未知时间';
    
    try {
        const date = new Date(timeString);
        if (isNaN(date.getTime())) return '无效时间';
        
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (error) {
        console.error('时间格式化失败:', error);
        return '时间格式错误';
    }
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getEmotionIntensity(dominantEmotion, emotions) {
    if (!emotions || !dominantEmotion) return 0;
    
    // 计算非neutral情绪的强度
    const nonNeutralIntensity = Object.entries(emotions)
        .filter(([emotion]) => emotion !== 'neutral')
        .reduce((sum, [, value]) => sum + value, 0);
    
    return Math.max(0, Math.min(1, nonNeutralIntensity));
}

// 通知系统
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    elements.notificationContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showError(message) {
    showNotification(message, 'error');
}