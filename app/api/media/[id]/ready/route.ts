import { canWriteMedia, fail, handleError, isUploader, logDbError, ok, readJson, resolveUploader } from '@/lib/api'

/** The phone finished PUTting a photo's three files. Let it into the feed. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await readJson<{ linkToken?: string | null }>(request)

    const uploader = await resolveUploader(body)
    if (!isUploader(uploader)) return fail(uploader.error, uploader.status)
    if (!(await canWriteMedia(id, uploader))) return fail('Not allowed.', 403)

    const { error } = await uploader.db
      .from('media')
      .update({ status: 'ready' })
      .eq('id', id)
      .eq('status', 'processing')

    if (error) {
      logDbError('media/ready', error, { mediaId: id })
      return fail(`Could not finish that upload: ${error.message}`, 500)
    }
    return ok({ status: 'ready' })
  } catch (error) {
    return handleError(error, 'media/ready')
  }
}
