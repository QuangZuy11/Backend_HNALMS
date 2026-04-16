const mongoose = require('mongoose');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  require('./src/modules/room-floor-management/models/room-type.model');
  require('./src/modules/room-floor-management/models/room.model');
  const BookingRequest = require('./src/modules/contract-management/models/booking-request.model');
  const contractController = require('./src/modules/contract-management/controllers/contract.controller');

  const bookingRequest = await BookingRequest.findOne({ transactionCode: 'Coc P114 42703957' }).populate('roomId');
  console.log('Found Booking:', bookingRequest ? bookingRequest._id : 'null');
  
  const mockReq = {
    body: {
      roomId: bookingRequest.roomId._id,
      bookingRequestId: bookingRequest._id,
      tenantInfo: {
         fullName: bookingRequest.name,
         cccd: bookingRequest.idCard,
         phone: bookingRequest.phone,
         email: bookingRequest.email,
         dob: bookingRequest.dob,
         address: bookingRequest.address,
         gender: bookingRequest.gender || "Other"
      },
      coResidents: bookingRequest.coResidents || [],
      contractDetails: {
         startDate: bookingRequest.startDate,
         duration: bookingRequest.duration
      },
      bookServices: bookingRequest.servicesInfo || [],
      prepayMonths: parseInt(bookingRequest.prepayMonths, 10) || bookingRequest.duration
    }
  };

  const mockRes = {
    status: (code) => {
      console.log('STATUS:', code);
      return mockRes;
    },
    json: (data) => {
      console.log('JSON:', JSON.stringify(data, null, 2));
    }
  };

  await contractController.createContract(mockReq, mockRes);
  process.exit(0);
}

test().catch(e => console.error(e));
