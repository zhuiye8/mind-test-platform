"""
学生端对接API模块 - 简化版本
只提供两个核心接口：视音频流检测和题目分析
"""

from .simple_api import SimpleStudentAPI, init_simple_api

__version__ = "2.0.0"
__author__ = "Emotion Detection System"

__all__ = [
    'SimpleStudentAPI',
    'init_simple_api'
]
