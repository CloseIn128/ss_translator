import React from 'react';
import { Tabs } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import ProjectGlossaryTab from './ProjectGlossaryTab';
import PublicGlossaryTab from './PublicGlossaryTab';

export default function GlossaryPanel({ messageApi }) {
  const tabItems = [
    {
      key: 'project',
      label: '项目术语表',
      children: (
        <ProjectGlossaryTab
          messageApi={messageApi}
        />
      ),
    },
    {
      key: 'builtin',
      label: <><BookOutlined /> 公共术语表</>,
      children: <PublicGlossaryTab messageApi={messageApi} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Tabs items={tabItems} size="small" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} />
    </div>
  );
}
