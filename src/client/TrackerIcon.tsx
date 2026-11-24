'use client';
import { Row } from './store';

export function TrackerIcon({ member }: { member: Row }) {
  const icon = member.trackerIcon;
  // eslint-disable-next-line @next/next/no-img-element
  if (icon?.kind === 'image') return <img className="tracker-icon-image" src={icon.value} alt="" />;
  return <>{icon?.kind === 'emoji' && icon.value ? icon.value : '✅'}</>;
}
