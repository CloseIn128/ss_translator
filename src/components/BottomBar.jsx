import React from 'react';
import { Button, Tag, Tooltip } from 'antd';
import {
  CodeOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useTask } from './TaskContext';

export default function BottomBar({ logVisible, onToggleLog }) {
  const { currentTask, taskHighlight, dismissTask, isTaskRunning } = useTask();

  const statusIcon = () => {
    if (!currentTask) return null;
    switch (currentTask.status) {
      case 'running':
        return <LoadingOutlined spin style={{ color: '#1890ff' }} />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  const statusColor = () => {
    if (!currentTask) return undefined;
    if (currentTask.status === 'completed') return 'success';
    if (currentTask.status === 'failed') return 'error';
    return 'processing';
  };

  return (
    <div className={`bottom-bar${taskHighlight ? ' highlight' : ''}`}>
      {/* Left: Log panel toggle */}
      <div className="bottom-bar-left">
        <Tooltip title={logVisible ? '隐藏日志面板' : '显示日志面板'}>
          <Button
            type="text"
            size="small"
            icon={<CodeOutlined />}
            className={`bottom-bar-log-btn${logVisible ? ' active' : ''}`}
            onClick={onToggleLog}
          >
            日志
          </Button>
        </Tooltip>
      </div>

      {/* Center / Right: Task status */}
      <div className="bottom-bar-center">
        {currentTask ? (
          <div className="bottom-bar-task">
            {statusIcon()}
            <Tag color={statusColor()} style={{ margin: 0, fontSize: 11 }}>
              {currentTask.name}
            </Tag>
            {currentTask.progress && (
              <span className="bottom-bar-progress">{currentTask.progress}</span>
            )}
            {currentTask.message && currentTask.status !== 'running' && (
              <span className="bottom-bar-message">{currentTask.message}</span>
            )}
            {!isTaskRunning && (
              <Tooltip title="关闭">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined style={{ fontSize: 10 }} />}
                  className="bottom-bar-dismiss"
                  onClick={dismissTask}
                />
              </Tooltip>
            )}
          </div>
        ) : (
          <span className="bottom-bar-idle">就绪</span>
        )}
      </div>
    </div>
  );
}
