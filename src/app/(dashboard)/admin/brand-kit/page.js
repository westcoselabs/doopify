import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Doopify | Brand Kit',
  description: 'Brand Kit now lives inside Settings.',
};

export default function BrandKitPage() {
  redirect('/admin/settings/brand');
}
