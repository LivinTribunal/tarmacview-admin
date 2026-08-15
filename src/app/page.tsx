import { redirect } from 'next/navigation'

// redirects and renders nothing, matching the shape doc 02 §Other records. where it
// lands is a decision, and a temporary one - the operator report does not exist yet, so
// the only register that does stands in: docs/specs/09-roles-permissions.md §"Sign-in
// and sign-out", retargeted by step 5 of docs/rebuild/00-operating-model.md §6.
//
// no session check here. the gate turns an anonymous visitor away before this runs, and
// the destination re-checks a cookie that no longer resolves to a person.
export default function RootPage() {
  redirect('/admin/device-types')
}
