// This component has been consolidated into SocketRidesShared.jsx
// Please use the shared component instead
import SocketRidesShared from '../../components/SocketRidesShared';
import { supabase } from '../supabaseClient';

const Rides = (props) => {
  return <SocketRidesShared {...props} supabaseClient={supabase} />;
};

export default Rides;
