#!/usr/bin/env python3
"""
GPU加速测试脚本
验证DeepFace和Emotion2Vec模型的GPU加速功能
"""

import os
import sys
import time
import logging
import numpy as np
from PIL import Image

# 添加项目路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models.model_manager import model_manager
from utils.gpu_manager import gpu_manager

# 设置日志级别
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_gpu_manager():
    """测试GPU管理器"""
    print("="*60)
    print("测试GPU管理器")
    print("="*60)
    
    # 获取GPU状态
    status = gpu_manager.get_gpu_status()
    print(f"GPU可用: {status['gpu_available']}")
    
    if status['gpu_available']:
        print(f"设备名称: {status.get('device_name', 'Unknown')}")
        print(f"总内存: {status.get('total_memory_gb', 0):.2f} GB")
        print(f"可用内存: {status.get('available_memory_gb', 0):.2f} GB")
        print(f"内存使用率: {status.get('memory_usage_percent', 0):.1f}%")
    
    # 优化内存
    print("\n优化GPU内存...")
    gpu_manager.optimize_memory()
    
    return status['gpu_available']

def test_deepface_gpu():
    """测试DeepFace GPU加速"""
    print("\n" + "="*60)
    print("测试DeepFace GPU加速")
    print("="*60)
    
    try:
        # 获取DeepFace分析器
        analyzer = model_manager.get_deepface_analyzer()
        
        # 创建测试图像
        test_image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        print(f"测试图像尺寸: {test_image.shape}")
        
        # 获取GPU状态
        gpu_status = analyzer.get_gpu_status()
        print(f"GPU可用: {gpu_status['gpu_available']}")
        print(f"GPU启用: {gpu_status['gpu_enabled']}")
        print(f"设备: {gpu_status['device']}")
        
        # 测试CPU模式
        print("\n--- CPU模式测试 ---")
        analyzer.disable_gpu()
        
        start_time = time.time()
        cpu_result = analyzer.analyze(test_image)
        cpu_time = time.time() - start_time
        
        print(f"CPU分析耗时: {cpu_time:.3f}秒")
        print(f"检测结果: 人脸={cpu_result['face_detected']}, 情绪={cpu_result['dominant_emotion']}")
        
        # 测试GPU模式（如果可用）
        if gpu_status['gpu_available']:
            print("\n--- GPU模式测试 ---")
            analyzer.enable_gpu()
            analyzer.optimize_gpu_memory()
            
            start_time = time.time()
            gpu_result = analyzer.analyze(test_image)
            gpu_time = time.time() - start_time
            
            print(f"GPU分析耗时: {gpu_time:.3f}秒")
            print(f"检测结果: 人脸={gpu_result['face_detected']}, 情绪={gpu_result['dominant_emotion']}")
            
            if cpu_time > 0 and gpu_time > 0:
                speedup = cpu_time / gpu_time
                print(f"GPU加速倍数: {speedup:.2f}x")
        else:
            print("GPU不可用，跳过GPU模式测试")
            
        return True
        
    except Exception as e:
        print(f"DeepFace测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_emotion2vec_gpu():
    """测试Emotion2Vec GPU加速"""
    print("\n" + "="*60)
    print("测试Emotion2Vec GPU加速")
    print("="*60)
    
    try:
        # 获取Emotion2Vec分析器
        analyzer = model_manager.get_emotion2vec_analyzer()
        
        # 创建测试音频数据 (3秒16kHz音频)
        sample_rate = 16000
        duration = 3
        samples = sample_rate * duration
        test_audio = np.random.uniform(-0.5, 0.5, samples).astype(np.float32)
        
        # 转换为字节数据进行测试
        import io
        import wave
        
        # 创建WAV格式的测试音频
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            # 转换为16位整数
            audio_int16 = (test_audio * 32767).astype(np.int16)
            wav_file.writeframes(audio_int16.tobytes())
        
        test_audio_bytes = buffer.getvalue()
        print(f"测试音频大小: {len(test_audio_bytes)} bytes")
        
        # 获取GPU状态
        gpu_status = analyzer.get_gpu_status()
        print(f"GPU可用: {gpu_status['gpu_available']}")
        print(f"GPU启用: {gpu_status['gpu_enabled']}")
        print(f"设备: {gpu_status['device']}")
        print(f"混合精度: {gpu_status['mixed_precision']}")
        
        if not analyzer.is_initialized:
            print("初始化Emotion2Vec分析器...")
            analyzer.initialize()
        
        # 测试CPU模式
        print("\n--- CPU模式测试 ---")
        analyzer.disable_gpu()
        
        start_time = time.time()
        try:
            cpu_result = analyzer.analyze(test_audio_bytes)
            cpu_time = time.time() - start_time
            
            print(f"CPU分析耗时: {cpu_time:.3f}秒")
            print(f"检测结果: 主要情绪={cpu_result['dominant_emotion']}, 置信度={cpu_result['confidence']:.3f}")
            
        except Exception as cpu_error:
            print(f"CPU模式测试失败: {cpu_error}")
            cpu_time = None
            
        # 测试GPU模式（如果可用）
        if gpu_status['gpu_available']:
            print("\n--- GPU模式测试 ---")
            analyzer.enable_gpu()
            analyzer.optimize_gpu_memory()
            
            start_time = time.time()
            try:
                gpu_result = analyzer.analyze(test_audio_bytes)
                gpu_time = time.time() - start_time
                
                print(f"GPU分析耗时: {gpu_time:.3f}秒")
                print(f"检测结果: 主要情绪={gpu_result['dominant_emotion']}, 置信度={gpu_result['confidence']:.3f}")
                
                if cpu_time and cpu_time > 0 and gpu_time > 0:
                    speedup = cpu_time / gpu_time
                    print(f"GPU加速倍数: {speedup:.2f}x")
                    
            except Exception as gpu_error:
                print(f"GPU模式测试失败: {gpu_error}")
        else:
            print("GPU不可用，跳过GPU模式测试")
            
        return True
        
    except Exception as e:
        print(f"Emotion2Vec测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_system_status():
    """测试系统状态"""
    print("\n" + "="*60)
    print("测试系统状态")
    print("="*60)
    
    try:
        status = model_manager.get_system_status()
        
        print("模型状态:")
        models = status['models']
        print(f"  Emotion2Vec已加载: {models['emotion2vec_loaded']}")
        print(f"  DeepFace已加载: {models['deepface_loaded']}")
        print(f"  视频处理器已加载: {models['video_processor_loaded']}")
        print(f"  所有模型已加载: {models['all_loaded']}")
        
        print("\nGPU状态:")
        gpu = status['gpu']
        print(f"  GPU可用: {gpu.get('gpu_available', False)}")
        if gpu.get('device_name'):
            print(f"  设备名称: {gpu['device_name']}")
            print(f"  总内存: {gpu.get('total_memory_gb', 0):.2f} GB")
            print(f"  已分配: {gpu.get('allocated_memory_gb', 0):.2f} GB")
            print(f"  可用: {gpu.get('available_memory_gb', 0):.2f} GB")
        
        print(f"\n优化启用: {status['optimization_enabled']}")
        
        return True
        
    except Exception as e:
        print(f"系统状态测试失败: {e}")
        return False

def main():
    """主测试函数"""
    print("GPU加速验证测试开始")
    print("="*80)
    
    results = {}
    
    # 测试GPU管理器
    results['gpu_manager'] = test_gpu_manager()
    
    # 测试DeepFace
    results['deepface'] = test_deepface_gpu()
    
    # 测试Emotion2Vec
    results['emotion2vec'] = test_emotion2vec_gpu()
    
    # 测试系统状态
    results['system_status'] = test_system_status()
    
    # 汇总结果
    print("\n" + "="*80)
    print("测试结果汇总")
    print("="*80)
    
    for test_name, result in results.items():
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    print(f"\n总体结果: {'✅ 所有测试通过' if all_passed else '❌ 部分测试失败'}")
    
    return all_passed

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)