import React from 'react';
import { HoldCasesPanel } from './HoldCasesPanel';

export function HoldCasesPage() {
  return (
    <>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Hold Cases</h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--txt3)' }}>
          View and manage all records currently on hold.
        </p>
      </div>
      <HoldCasesPanel />
    </>
  );
}
