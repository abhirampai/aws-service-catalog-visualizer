interface ReviewPayloadProps {
  payload: Record<string, string | string[]>
}

export function ReviewPayload({ payload }: ReviewPayloadProps) {
  return (
    <section className="review-payload" aria-labelledby="review-payload-heading">
      <h3 id="review-payload-heading">Review payload</h3>
      <p className="field-helper">Local-only preview. Nothing is sent to AWS or provisioned.</p>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </section>
  )
}
