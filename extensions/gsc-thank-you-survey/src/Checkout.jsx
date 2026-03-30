import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [heardAboutUs, setHeardAboutUs] = useState('');
  const [mainReason, setMainReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const orderConfirmation = shopify.orderConfirmation?.value;
  const orderId = orderConfirmation?.order?.id || '';
  const confirmationNumber = orderConfirmation?.number || '';

  async function handleSubmit() {
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        orderId,
        orderNumber: confirmationNumber,
        heardAboutUs,
        mainReason,
        notes,
      };

      console.log('Submitting payload:', payload);

      const response = await fetch(
        'https://cliff-flash-plains-guest.trycloudflare.com/api/survey-submit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: JSON.stringify(payload),
        }
      );

      const text = await response.text();
      console.log('Backend status:', response.status);
      console.log('Backend body:', text);

      if (!response.ok) {
        throw new Error(`Backend failed: ${response.status} ${text}`);
      }

      const parsed = JSON.parse(text);

      if (!parsed.ok) {
        throw new Error(parsed.error || 'Unknown backend error');
      }

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <s-banner heading="Thanks, that helps a lot">
        <s-text>We appreciate it.</s-text>
      </s-banner>
    );
  }

  return (
    <s-stack gap="base">
      <s-heading>Quick question - takes 5 seconds</s-heading>

      <s-stack gap="tight">
        <s-text emphasis="bold">1. How did you hear about us?</s-text>
        <s-stack gap="tight">
          <s-button
            variant={heardAboutUs === 'Google' ? 'primary' : 'secondary'}
            onClick={() => setHeardAboutUs('Google')}
          >
            Google
          </s-button>
          <s-button
            variant={heardAboutUs === 'Facebook / Instagram' ? 'primary' : 'secondary'}
            onClick={() => setHeardAboutUs('Facebook / Instagram')}
          >
            Facebook / Instagram
          </s-button>
          <s-button
            variant={heardAboutUs === 'Friend / golf club / rep' ? 'primary' : 'secondary'}
            onClick={() => setHeardAboutUs('Friend / golf club / rep')}
          >
            Friend / golf club / rep
          </s-button>
          <s-button
            variant={heardAboutUs === 'Other' ? 'primary' : 'secondary'}
            onClick={() => setHeardAboutUs('Other')}
          >
            Other
          </s-button>
        </s-stack>

        {heardAboutUs ? (
          <s-text>Selected: {heardAboutUs}</s-text>
        ) : null}
      </s-stack>

      <s-stack gap="tight">
        <s-text emphasis="bold">2. Why did you buy today?</s-text>
        <s-stack gap="tight">
          <s-button
            variant={mainReason === 'Easier to play' ? 'primary' : 'secondary'}
            onClick={() => setMainReason('Easier to play')}
          >
            Easier to play
          </s-button>
          <s-button
            variant={mainReason === 'Less walking / health' ? 'primary' : 'secondary'}
            onClick={() => setMainReason('Less walking / health')}
          >
            Less walking / health
          </s-button>
          <s-button
            variant={mainReason === 'Easy to transport' ? 'primary' : 'secondary'}
            onClick={() => setMainReason('Easy to transport')}
          >
            Easy to transport
          </s-button>
          <s-button
            variant={mainReason === 'Offer / other' ? 'primary' : 'secondary'}
            onClick={() => setMainReason('Offer / other')}
          >
            Offer / other
          </s-button>
        </s-stack>

        {mainReason ? (
          <s-text>Selected: {mainReason}</s-text>
        ) : null}
      </s-stack>

      {heardAboutUs && mainReason ? (
        <s-text-field
          label="Optional note"
          value={notes}
          onInput={(event) => setNotes(event.target.value)}
        />
      ) : null}

      {error ? <s-text>{error}</s-text> : null}

      <s-button
        variant="primary"
        disabled={!heardAboutUs || !mainReason || submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </s-button>
    </s-stack>
  );
}