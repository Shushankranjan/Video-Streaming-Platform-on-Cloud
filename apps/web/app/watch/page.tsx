import { Suspense } from 'react';
import WatchPageInner from './watch-page-inner';

export default function WatchPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <WatchPageInner />
    </Suspense>
  );
}
