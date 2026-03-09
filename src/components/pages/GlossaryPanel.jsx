import React from 'react';
import { Tabs } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import ProjectGlossaryTab from './glossary/ProjectGlossaryTab';
import PublicGlossaryTab from './glossary/PublicGlossaryTab';

export default function GlossaryPanel({ project, onUpdateGlossary, onUpdateKeywords, messageApi }) {
  const tabItems = [
    {
      key: 'project',
      label: '项目术语表',
      children: (
        <ProjectGlossaryTab
          project={project}
          onUpdateGlossary={onUpdateGlossary}
          onUpdateKeywords={onUpdateKeywords}
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
