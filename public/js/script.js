// script.js
function confirmDelete() {
  return confirm("Are you sure you want to delete this conference?");
}

function formatDate(dateString) {
  const options = { day: "2-digit", month: "2-digit", year: "numeric" };
  const formattedDate = new Date(dateString).toLocaleDateString(
    "en-GB",
    options
  );
  return formattedDate.split("/").join("-");
}

function updateStatus(newStatus) {
  // const userId = ;

  // Send a POST request to the server to update the status
  $.ajax({
    url: `/updateStatus/${userId}`,
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({ newStatus: newStatus }),
    success: function (response) {
      console.log(response.message);
      // Handle success, update UI, etc.
    },
    error: function (error) {
      console.error(error.responseJSON.message);
      // Handle error, show error message, etc.
    },
  });
}
