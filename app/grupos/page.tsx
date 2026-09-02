import { AppShell } from '@/components/nexo/app-shell';
import { GroupsManager } from '@/components/nexo/groups-manager';

export default function GroupsPage() {
  return <AppShell active="grupos"><div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8"><GroupsManager /></div></AppShell>;
}
