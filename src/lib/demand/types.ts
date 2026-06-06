/**
 * demand/types.ts — Demand DSL 类型定义
 *
 * 用于结构化描述 PM 自然语言需求
 */

/**
 * 需求类型
 */
export type DemandType =
  | 'add_field'      // 新增字段
  | 'add_page'        // 新增页面
  | 'add_filter'      // 新增筛选/查询
  | 'add_interaction' // 新增交互逻辑
  | 'add_api'         // 新增 API 端点
  | 'refactor'        // 重构
  | 'bugfix'          // Bug 修复
  | 'optimize'        // 性能优化
  | 'unknown';        // 待识别

/**
 * 实体定义
 */
export interface DemandEntity {
  name: string;           // 实体名称，如 "Article"
  fields: string[];       // 相关字段，如 ["likeCount", "latestLikers"]
}

/**
 * 前端需求
 */
export interface DemandFrontend {
  components: string[];   // 需要新增/修改的组件
  routes: string[];       // 涉及的路由
  stateManagement: string[]; // 涉及的 state 管理
}

/**
 * 后端需求
 */
export interface DemandBackend {
  apis: string[];         // API 端点，如 ["POST /articles/:slug/like"]
  models: string[];       // 涉及的数据库模型
  services: string[];      // 涉及的服务层
}

/**
 * 待澄清问题
 */
export interface Clarification {
  question: string;       // 澄清问题
  options?: string[];     // 可选的选项列表
  required: boolean;      // 是否必答
}

/**
 * 需求澄清置信度
 */
export interface DemandConfidence {
  score: number;          // 0-1 置信度分数
  reasons: string[];      // 置信/不置信原因
}

/**
 * 结构化需求 DSL
 */
export interface DemandDSL {
  /** 唯一 ID */
  id: string;
  /** 原始需求文本 */
  originalText: string;
  /** 需求类型 */
  type: DemandType;
  /** 功能描述 */
  feature: string;
  /** 涉及的实体 */
  entities: DemandEntity[];
  /** 前端需求 */
  frontend?: DemandFrontend;
  /** 后端需求 */
  backend?: DemandBackend;
  /** 待澄清问题 */
  clarifications: Clarification[];
  /** 置信度 */
  confidence: DemandConfidence;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * Checkpoint 状态
 */
export type CheckpointStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Pipeline 阶段
 */
export type PipelineStage =
  | 'demand'     // 需求录入
  | 'clarify'    // 澄清
  | 'plan'       // 方案设计
  | 'context'    // 上下文构建
  | 'generate'   // 代码生成
  | 'verify'     // 验证
  | 'pr';        // PR 提交

/**
 * Pipeline Checkpoint
 */
export interface PipelineCheckpoint {
  id: string;
  demandId: string;
  stage: PipelineStage;
  status: CheckpointStatus;
  input: unknown;
  output: unknown;
  modifiedFiles: string[];
  createdAt: number;
  resumedFrom: string | null;
}

/**
 * 验证结果
 */
export interface VerifyResult {
  success: boolean;
  lintPassed: boolean;
  testPassed: boolean;
  errors: string[];
  warnings: string[];
  coverage?: number;
}