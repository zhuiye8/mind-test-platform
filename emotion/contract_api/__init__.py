"""
契约API适配层
为emotion项目提供符合契约要求的REST API接口
"""

from .routes import contract_bp
from .callbacks import CallbackService, set_callback_config  
from .adapters import ContractDataAdapter

__all__ = ['contract_bp', 'CallbackService', 'ContractDataAdapter', 'set_callback_config']